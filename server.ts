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
  projectIds: z.array(z.string().min(1).max(100)).max(500),
});
export type Space = z.infer<typeof spaceSchema>;

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPersonal: z.boolean(),
});
export type SpaceProject = z.infer<typeof projectSchema>;

const stateSchema = z.object({
  spaces: z.array(spaceSchema),
  activeSpaceId: z.string().nullable(),
  projects: z.array(projectSchema),
  /** Show other spaces' projects under the thread list's More. */
  showOthersInMore: z.boolean(),
  /** True when the user hid groups themselves (More must stay reachable). */
  hasUserHiddenGroups: z.boolean(),
});
export type SpacesState = z.infer<typeof stateSchema>;

export const rpcContract = defineRpcContract({
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
    return {
      spaces,
      activeSpaceId: await readActive(spaces),
      projects: await listProjects(),
      showOthersInMore: (await bb.storage.kv.get<boolean>(KV_SHOW_MORE)) ?? false,
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
  ): Promise<SpacesState> {
    return serial(async () => {
      const ids = new Set(spaces.map((s) => s.id));
      if (ids.size !== spaces.length) throw new Error("Space ids must be unique");
      await bb.storage.kv.set(KV_SPACES, spaces);
      if (showOthersInMore !== undefined) {
        await bb.storage.kv.set(KV_SHOW_MORE, showOthersInMore);
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

  bb.rpc.register(rpcContract, {
    state_get: () => getState(),
    space_switch: ({ spaceId }) => switchTo(spaceId),
    spaces_off: () => showAll(),
    spaces_save: ({ spaces, showOthersInMore }) =>
      saveSpaces(spaces, showOthersInMore),
  });

  const usage = [
    "Usage:",
    "  bb space list [--json]     List spaces; * marks the current one",
    "  bb space <name|number>     Switch to a space",
    "  bb space off               Show all projects and restore the list's grouping",
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
