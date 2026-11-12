// Spaces — Arc-style workspaces for bb's sidebar.
//
// A space is a named set of projects with an icon. Switching to a space hides
// every project that belongs only to other spaces by writing the Thread list
// plugin's `hiddenGroups` preference (keys `project:<id>`). Groups the user
// hid by hand are kept: we remember which keys Spaces itself added and only
// ever replace those.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const spaceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(40),
  /** A bb icon name, e.g. "Laptop". */
  icon: z.string().regex(/^[A-Za-z0-9]{1,40}$/).optional(),
  /** Legacy field from v0.1; no longer shown. */
  color: z.string().regex(COLOR_RE).optional(),
  /** Hue mixed into the sidebar while the space is active. */
  tint: z
    .enum(["blue", "teal", "green", "yellow", "orange", "red", "pink", "purple"])
    .optional(),
  projectIds: z.array(z.string().min(1).max(100)).max(500),
});
export type Space = z.infer<typeof spaceSchema>;

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPersonal: z.boolean(),
});
export type SpaceProject = z.infer<typeof projectSchema>;

const switcherStyleSchema = z.enum(["menu", "icons"]);
export type SwitcherStyle = z.infer<typeof switcherStyleSchema>;

const stateSchema = z.object({
  spaces: z.array(spaceSchema),
  activeSpaceId: z.string().nullable(),
  projects: z.array(projectSchema),
  /** Show other spaces' projects under the thread list's More. */
  showOthersInMore: z.boolean(),
  /** Sidebar header: a dropdown with the current space, or a row of icons. */
  switcherStyle: switcherStyleSchema,
  /** True when the user hid groups themselves (More must stay reachable). */
  hasUserHiddenGroups: z.boolean(),
});
export type SpacesState = z.infer<typeof stateSchema>;

/** A folder dropped from the file manager. Browsers hide full paths, so
 * usually only `name` is known and the server finds the folder on disk. */
const droppedFolderSchema = z.object({
  name: z.string().trim().min(1).max(255),
  path: z.string().trim().min(1).max(1024).optional(),
});
export type DroppedFolder = z.infer<typeof droppedFolderSchema>;

const folderResultSchema = z.object({
  name: z.string(),
  status: z.enum(["created", "existing", "not_found", "failed"]),
  path: z.string().optional(),
  projectId: z.string().optional(),
  message: z.string().optional(),
});
export type FolderResult = z.infer<typeof folderResultSchema>;

export const rpcContract = defineRpcContract({
  folders_add: {
    input: z.object({
      folders: z.array(droppedFolderSchema).min(1).max(50),
      /** Space to put the projects in; omit to only create the projects. */
      spaceId: z.string().optional(),
    }),
    output: z.object({
      state: stateSchema,
      results: z.array(folderResultSchema),
    }),
  },
  state_get: { input: z.null(), output: stateSchema },
  space_switch: {
    input: z.object({ spaceId: z.string() }),
    output: stateSchema,
  },
  spaces_off: { input: z.null(), output: stateSchema },
  spaces_save: {
    input: z.object({
      spaces: z.array(spaceSchema).min(1).max(9),
      showOthersInMore: z.boolean().optional(),
      switcherStyle: switcherStyleSchema.optional(),
    }),
    output: stateSchema,
  },
});

/** Realtime channel the app listens on after every change. */
export const SPACES_CHANGED = "spaces-changed";

const KV_SPACES = "spaces";
const KV_ACTIVE = "activeSpaceId";
const KV_MANAGED = "managedHiddenGroups";
const KV_SHOW_MORE = "showOthersInMore";
const KV_SWITCHER_STYLE = "switcherStyle";
const KV_PREV_MODE = "previousOrganizationMode";

const THREAD_LIST = "thread-list";
const PERSONAL_PROJECT_ID = "proj_personal";

/** Projects seeded into "Work" on first run (demo projects). */
const DEFAULT_ICONS: Record<string, string> = { work: "Laptop", personal: "Home" };

const prefsSchema = z.object({
  preferences: z
    .object({
      hiddenGroups: z.array(z.string()).optional(),
      organizationMode: z.string().optional(),
    })
    .passthrough(),
});
const setPrefSchema = z.object({ key: z.string(), value: z.unknown() });

export default async function plugin(bb: BbPluginApi) {
  async function listProjects(): Promise<SpaceProject[]> {
    // bb's implicit personal project is not a project group in the thread
    // list (its threads show under "Threads"), so spaces cannot hide it.
    const result = await bb.sdk.projects.list({ includePersonal: false });
    return result
      .filter((project) => project.id !== PERSONAL_PROJECT_ID)
      .map((project) => ({
      id: project.id,
      name: project.name,
      isPersonal: false,
      }));
  }

  async function readSpaces(): Promise<Space[]> {
    const stored = await bb.storage.kv.get<unknown>(KV_SPACES);
    const parsed = z.array(spaceSchema).safeParse(stored);
    if (parsed.success && parsed.data.length > 0) {
      // Spaces saved before icons existed get the seeded defaults.
      return parsed.data.map((space) => ({
        ...space,
        icon: space.icon ?? DEFAULT_ICONS[space.id] ?? "Layers",
        projectIds: space.projectIds.filter((id) => id !== PERSONAL_PROJECT_ID),
      }));
    }
    // First run: two empty spaces. Nothing is hidden until the user puts
    // projects into a space and switches to it.
    const seeded: Space[] = [
      { id: "work", name: "Work", icon: "Laptop", projectIds: [] },
      { id: "personal", name: "Personal", icon: "Home", projectIds: [] },
    ];
    await bb.storage.kv.set(KV_SPACES, seeded);
    return seeded;
  }

  async function readActive(spaces: Space[]): Promise<string | null> {
    const id = await bb.storage.kv.get<string>(KV_ACTIVE);
    if (id && spaces.some((space) => space.id === id)) return id;
    return null;
  }

  async function readThreadListPrefs() {
    return bb.sdk.plugins.callRpc({
      pluginId: THREAD_LIST,
      method: "listPreferences",
      input: null,
      outputSchema: prefsSchema,
    });
  }

  async function getState(): Promise<SpacesState> {
    const spaces = await readSpaces();
    const managed = new Set(
      (await bb.storage.kv.get<string[]>(KV_MANAGED)) ?? [],
    );
    let hasUserHiddenGroups = false;
    try {
      const prefs = await readThreadListPrefs();
      hasUserHiddenGroups = (prefs.preferences.hiddenGroups ?? []).some(
        (key) => !managed.has(key),
      );
    } catch {
      hasUserHiddenGroups = true; // unknown: keep More reachable
    }
    const projects = await listProjects();
    // Drop ids of projects deleted since they were put in a space.
    const known = new Set(projects.map((project) => project.id));
    const live = spaces.map((space) => ({
      ...space,
      projectIds: space.projectIds.filter((id) => known.has(id)),
    }));
    return {
      spaces: live,
      activeSpaceId: await readActive(spaces),
      projects,
      showOthersInMore: (await bb.storage.kv.get<boolean>(KV_SHOW_MORE)) ?? false,
      switcherStyle:
        (await bb.storage.kv.get<string>(KV_SWITCHER_STYLE)) === "icons"
          ? "icons"
          : "menu",
      hasUserHiddenGroups,
    };
  }

  /** Project group keys to hide while `space` is active. */
  function hiddenKeysFor(space: Space, spaces: Space[]): string[] {
    const visible = new Set(space.projectIds);
    const hidden = new Set<string>();
    for (const other of spaces) {
      if (other.id === space.id) continue;
      for (const id of other.projectIds) {
        if (!visible.has(id)) hidden.add(`project:${id}`);
      }
    }
    return [...hidden].sort();
  }

  async function setThreadListPref(key: string, value: unknown) {
    await bb.sdk.plugins.callRpc({
      pluginId: THREAD_LIST,
      method: "setPreference",
      input: { key, value, origin: "spaces" } as never,
      outputSchema: setPrefSchema,
    });
  }

  async function apply(space: Space, spaces: Space[]): Promise<void> {
    const prefs = await readThreadListPrefs();
    const current = prefs.preferences.hiddenGroups ?? [];
    const previouslyManaged = new Set(
      (await bb.storage.kv.get<string[]>(KV_MANAGED)) ?? [],
    );
    const managed = hiddenKeysFor(space, spaces);
    // Keep what the user hid themselves; replace only what we added.
    const userHidden = current.filter((key) => !previouslyManaged.has(key));
    const next = [...new Set([...userHidden, ...managed])];
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      await setThreadListPref("hiddenGroups", next);
    }
    // Project groups only exist when the list is organized by project.
    const mode = prefs.preferences.organizationMode;
    if (mode !== "project") {
      if ((await bb.storage.kv.get<string>(KV_PREV_MODE)) === undefined && mode) {
        await bb.storage.kv.set(KV_PREV_MODE, mode);
      }
      await setThreadListPref("organizationMode", "project");
    }
    await bb.storage.kv.set(KV_MANAGED, managed);
    await bb.storage.kv.set(KV_ACTIVE, space.id);
  }

  // Serialize every write so two quick switches cannot interleave.
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  async function switchTo(spaceId: string): Promise<SpacesState> {
    return serial(async () => {
      const spaces = await readSpaces();
      const space = spaces.find((s) => s.id === spaceId);
      if (!space) throw new Error(`No space with id ${spaceId}`);
      await apply(space, spaces);
      const state = await getState();
      bb.realtime.publish(SPACES_CHANGED, { activeSpaceId: space.id });
      return state;
    });
  }

  /** Leave every space: show all projects and restore the user's grouping. */
  async function showAll(): Promise<SpacesState> {
    return serial(async () => {
      const prefs = await readThreadListPrefs();
      const current = prefs.preferences.hiddenGroups ?? [];
      const managed = new Set(
        (await bb.storage.kv.get<string[]>(KV_MANAGED)) ?? [],
      );
      const next = current.filter((key) => !managed.has(key));
      if (next.length !== current.length) {
        await setThreadListPref("hiddenGroups", next);
      }
      const previous = await bb.storage.kv.get<string>(KV_PREV_MODE);
      if (previous && prefs.preferences.organizationMode === "project") {
        await setThreadListPref("organizationMode", previous);
      }
      await bb.storage.kv.delete(KV_PREV_MODE);
      await bb.storage.kv.set(KV_MANAGED, []);
      await bb.storage.kv.delete(KV_ACTIVE);
      const state = await getState();
      bb.realtime.publish(SPACES_CHANGED, { activeSpaceId: null });
      return state;
    });
  }

  async function saveSpaces(
    spaces: Space[],
    showOthersInMore: boolean | undefined,
    switcherStyle: SwitcherStyle | undefined,
  ): Promise<SpacesState> {
    return serial(async () => {
      const ids = new Set(spaces.map((s) => s.id));
      if (ids.size !== spaces.length) throw new Error("Space ids must be unique");
      await bb.storage.kv.set(KV_SPACES, spaces);
      if (showOthersInMore !== undefined) {
        await bb.storage.kv.set(KV_SHOW_MORE, showOthersInMore);
      }
      if (switcherStyle !== undefined) {
        await bb.storage.kv.set(KV_SWITCHER_STYLE, switcherStyle);
      }
      const active = await readActive(spaces);
      if (active !== null) {
        await apply(spaces.find((s) => s.id === active)!, spaces);
      }
      const state = await getState();
      bb.realtime.publish(SPACES_CHANGED, { activeSpaceId: active });
      return state;
    });
  }

  // ---- Folders → projects --------------------------------------------------

  const SKIP_DIRS = new Set([
    "node_modules", "appdata", "application data", "library", "windows",
    "program files", "program files (x86)", "programdata", "$recycle.bin",
    "system volume information", "dist", "build",
  ]);
  const SEARCH_DEPTH = 4;
  const SEARCH_DIR_BUDGET = 1500;

  const normPath = (path: string) =>
    path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const baseName = (path: string) =>
    path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path;
  const parentOf = (path: string) => {
    const trimmed = path.replace(/[\\/]+$/, "");
    const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return index > 0 ? trimmed.slice(0, index) : null;
  };

  async function primaryHostId(): Promise<string> {
    const config = await bb.sdk.system.config();
    if (config.primaryHostId) return config.primaryHostId;
    const hosts = await bb.sdk.hosts.list();
    const host = hosts.find((h) => h.status === "connected") ?? hosts[0];
    if (!host) throw new Error("No machine is connected");
    return host.id;
  }

  /**
   * Find folders by name on the host: first among git repos bb discovers,
   * then next to folders already found (a multi-folder drop usually comes
   * from one parent), then a bounded walk from the home folder and drives.
   */
  async function resolveFolders(
    hostId: string,
    names: string[],
  ): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    const want = new Set(names.map((name) => name.toLowerCase()));
    const missing = () => [...want].filter((key) => !found.has(key)).length;

    try {
      const discovered = await bb.sdk.hosts.experimental_discoverRepos({ hostId });
      const repos = [...discovered.repos].sort((a, b) =>
        b.lastActivityAt.localeCompare(a.lastActivityAt),
      );
      for (const repo of repos) {
        const key = baseName(repo.path).toLowerCase();
        if (want.has(key) && !found.has(key)) found.set(key, repo.path);
      }
    } catch (cause) {
      bb.log.warn(`discoverRepos failed: ${String(cause)}`);
    }

    const listed = new Set<string>();
    async function list(path: string | undefined) {
      try {
        const listing = await bb.sdk.hosts.directory({ hostId, path });
        listed.add(normPath(listing.directory));
        return listing;
      } catch {
        return null;
      }
    }
    const matchIn = (entries: { kind: string; name: string; path: string }[]) => {
      for (const entry of entries) {
        if (entry.kind !== "directory") continue;
        const key = entry.name.toLowerCase();
        if (want.has(key) && !found.has(key)) found.set(key, entry.path);
      }
    };

    // Siblings of folders already found.
    if (missing() > 0) {
      const parents = new Set(
        [...found.values()].map(parentOf).filter((p): p is string => p !== null),
      );
      for (const parent of parents) {
        const listing = await list(parent);
        if (listing) matchIn(listing.entries);
        if (missing() === 0) break;
      }
    }

    // Breadth-first walk from home, then from the drive roots.
    if (missing() > 0) {
      const home = await list(undefined);
      if (home) {
        matchIn(home.entries);
        const frontier: { path: string; depth: number }[] = [
          ...home.entries
            .filter((e) => e.kind === "directory" && !e.name.startsWith("."))
            .filter((e) => !SKIP_DIRS.has(e.name.toLowerCase()))
            .map((e) => ({ path: e.path, depth: 1 })),
          ...home.roots.map((root) => ({ path: root, depth: 0 })),
        ];
        let budget = SEARCH_DIR_BUDGET;
        while (frontier.length > 0 && missing() > 0 && budget > 0) {
          const batch = frontier.splice(0, 8);
          budget -= batch.length;
          const listings = await Promise.all(
            batch.map(async (item) => {
              if (listed.has(normPath(item.path))) return null;
              const listing = await list(item.path);
              return listing ? { listing, depth: item.depth } : null;
            }),
          );
          for (const entry of listings) {
            if (!entry) continue;
            matchIn(entry.listing.entries);
            if (entry.depth >= SEARCH_DEPTH) continue;
            for (const child of entry.listing.entries) {
              if (child.kind !== "directory") continue;
              const lower = child.name.toLowerCase();
              if (lower.startsWith(".") || lower.startsWith("$")) continue;
              if (SKIP_DIRS.has(lower)) continue;
              frontier.push({ path: child.path, depth: entry.depth + 1 });
            }
          }
        }
      }
    }
    return found;
  }

  async function addFolders(
    folders: DroppedFolder[],
    spaceId: string | undefined,
  ): Promise<{ state: SpacesState; results: FolderResult[] }> {
    const hostId = await primaryHostId();
    const unique = [
      ...new Map(
        folders.map((f) => [f.path ? normPath(f.path) : f.name.toLowerCase(), f]),
      ).values(),
    ];
    const needLookup = unique.filter((f) => !f.path).map((f) => f.name);
    const located =
      needLookup.length > 0
        ? await resolveFolders(hostId, needLookup)
        : new Map<string, string>();

    const existing = await bb.sdk.projects.list({ includePersonal: false });
    const byPath = new Map<string, string>();
    for (const project of existing) {
      for (const source of project.sources ?? []) {
        byPath.set(normPath(source.path), project.id);
      }
    }

    const results: FolderResult[] = [];
    for (const folder of unique) {
      const path = folder.path ?? located.get(folder.name.toLowerCase());
      const name = folder.path ? baseName(folder.path) : folder.name;
      if (!path) {
        results.push({
          name,
          status: "not_found",
          message: "not found in your home folder or drives",
        });
        continue;
      }
      const known = byPath.get(normPath(path));
      if (known) {
        results.push({ name, status: "existing", path, projectId: known });
        continue;
      }
      try {
        const project = await bb.sdk.projects.create({
          name,
          source: { type: "local_path", hostId, path },
        });
        byPath.set(normPath(path), project.id);
        results.push({ name, status: "created", path, projectId: project.id });
      } catch (cause) {
        results.push({
          name,
          status: "failed",
          path,
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }

    const projectIds = results
      .map((r) => r.projectId)
      .filter((id): id is string => id !== undefined);
    if (spaceId !== undefined && projectIds.length > 0) {
      const spaces = await readSpaces();
      if (!spaces.some((s) => s.id === spaceId)) {
        throw new Error(`No space with id ${spaceId}`);
      }
      const next = spaces.map((space) =>
        space.id === spaceId
          ? {
              ...space,
              projectIds: [...new Set([...space.projectIds, ...projectIds])],
            }
          : space,
      );
      return { state: await saveSpaces(next, undefined, undefined), results };
    }
    const state = await getState();
    bb.realtime.publish(SPACES_CHANGED, { activeSpaceId: state.activeSpaceId });
    return { state, results };
  }

  bb.rpc.register(rpcContract, {
    folders_add: ({ folders, spaceId }) => addFolders(folders, spaceId),
    state_get: () => getState(),
    space_switch: ({ spaceId }) => switchTo(spaceId),
    spaces_off: () => showAll(),
    spaces_save: ({ spaces, showOthersInMore, switcherStyle }) =>
      saveSpaces(spaces, showOthersInMore, switcherStyle),
  });

  const usage = [
    "Usage:",
    "  bb space list [--json]     List spaces; * marks the current one",
    "  bb space <name|number>     Switch to a space",
    "  bb space off               Show all projects and restore the list's grouping",
    "  bb space add [--space <name|number>] <folder>...",
    "                             Make each folder (name or path) a project in a space",
  ].join("\n");

  bb.cli.register({
    name: "space",
    summary: "List and switch Arc-style sidebar spaces",
    commands: [
      { name: "list", summary: "List spaces", usage: "bb space list [--json]" },
      {
        name: "off",
        summary: "Show all projects and restore the thread list's grouping",
        usage: "bb space off [--json]",
      },
      {
        name: "add",
        summary: "Create projects from folders (names or paths) and put them in a space",
        usage: "bb space add [--space <name|number>] <folder>... [--json]",
      },
      {
        name: "switch",
        summary: "Switch to a space by name or number (the word switch is optional)",
        usage: "bb space [switch] <name|number>",
      },
    ],
    async run(argv) {
      const json = argv.includes("--json");
      const args = argv.filter((arg) => arg !== "--json");
      const [first] = args;
      if (first === undefined || first === "help" || first === "--help") {
        return { exitCode: 0, stdout: usage };
      }
      const state = await getState();
      const projectName = (id: string) =>
        state.projects.find((p) => p.id === id)?.name ?? id;
      if (first === "list" && args.length === 1) {
        if (json) return { exitCode: 0, stdout: JSON.stringify(state) };
        const lines = state.spaces.map((space, index) => {
          const mark = space.id === state.activeSpaceId ? "*" : " ";
          const projects = space.projectIds.map(projectName).join(", ");
          return `${mark} ${index + 1}. ${space.name}  [${projects || "no projects"}]`;
        });
        if (state.activeSpaceId === null) lines.unshift("* All projects (no space selected)");
        return { exitCode: 0, stdout: lines.join("\n") };
      }
      if (first === "off" && args.length === 1) {
        const next = await showAll();
        return {
          exitCode: 0,
          stdout: json ? JSON.stringify(next) : "Showing all projects.",
        };
      }
      if (first === "add") {
        // bb space add [--space <name|number>] <folder name|path>...
        let rest = args.slice(1);
        let spaceQuery: string | null = null;
        const flag = rest.indexOf("--space");
        if (flag >= 0) {
          spaceQuery = rest[flag + 1] ?? null;
          rest = rest.filter((_, i) => i !== flag && i !== flag + 1);
        }
        if (rest.length === 0) {
          return { exitCode: 1, stderr: "Usage: bb space add [--space <name|number>] <folder>..." };
        }
        let space: Space | undefined;
        if (spaceQuery !== null) {
          const q = spaceQuery.toLowerCase();
          space = /^\d+$/.test(q)
            ? state.spaces[Number(q) - 1]
            : state.spaces.find((s) => s.name.toLowerCase() === q || s.id === q);
          if (!space) {
            return { exitCode: 1, stderr: `No space named "${spaceQuery}". Run "bb space list".` };
          }
        } else if (state.activeSpaceId !== null) {
          space = state.spaces.find((s) => s.id === state.activeSpaceId);
        }
        const folders = rest.slice(0, 50).map((arg) =>
          /[\\/]/.test(arg) ? { name: baseName(arg), path: arg } : { name: arg },
        );
        const { results } = await addFolders(folders, space?.id);
        if (json) return { exitCode: 0, stdout: JSON.stringify(results) };
        const lines = results.map((r) =>
          r.status === "created" || r.status === "existing"
            ? `${r.status === "created" ? "+" : "="} ${r.name}  ${r.path}`
            : `! ${r.name}  ${r.message ?? r.status}`,
        );
        if (space) lines.push(`Space: ${space.name}`);
        const failed = results.some((r) => r.status === "not_found" || r.status === "failed");
        return { exitCode: failed ? 1 : 0, stdout: lines.join("\n") };
      }
      const nameArgs = first === "switch" ? args.slice(1) : args;
      const query = nameArgs.join(" ").trim().toLowerCase();
      const byNumber = /^\d+$/.test(query)
        ? state.spaces[Number(query) - 1]
        : undefined;
      const target =
        byNumber ??
        state.spaces.find(
          (s) => s.name.toLowerCase() === query || s.id === query,
        );
      if (!target) {
        return {
          exitCode: 1,
          stderr: `No space named "${nameArgs.join(" ")}". Run "bb space list".`,
        };
      }
      const next = await switchTo(target.id);
      return {
        exitCode: 0,
        stdout: json
          ? JSON.stringify(next)
          : `Switched to ${target.name}.`,
      };
    },
  });
}
