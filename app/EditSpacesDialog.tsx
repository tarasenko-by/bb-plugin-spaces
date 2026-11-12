import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Space, SpacesState } from "../server";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getRpc, setSpacesState } from "./spaces-store.js";
import { DEFAULT_SPACE_ICON, SPACE_ICONS } from "./space-icons.js";
import { addDroppedFolders, useFolderDropTarget } from "./folder-drop.js";
import { spaceShortcutLabel } from "./shortcuts.js";

const MAX_SPACES = 9;

function slugify(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "space";
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

export function EditSpacesDialog({
  open,
  onOpenChange,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: SpacesState;
}) {
  const [draft, setDraft] = useState<Space[]>(state.spaces);
  const [selectedId, setSelectedId] = useState<string | null>(
    state.activeSpaceId ?? state.spaces[0]?.id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const [showOthersInMore, setShowOthersInMore] = useState(
    state.showOthersInMore,
  );

  // Reset the draft every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setDraft(state.spaces);
    setShowOthersInMore(state.showOthersInMore);
    setSelectedId(state.activeSpaceId ?? state.spaces[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = draft.find((space) => space.id === selectedId) ?? null;
  const update = (id: string, patch: Partial<Space>) =>
    setDraft((spaces) =>
      spaces.map((space) => (space.id === id ? { ...space, ...patch } : space)),
    );

  const addSpace = () => {
    const taken = new Set(draft.map((space) => space.id));
    const name = "New Space";
    const space: Space = {
      id: slugify(name, taken),
      name,
      icon: DEFAULT_SPACE_ICON,
      projectIds: [],
    };
    setDraft([...draft, space]);
    setSelectedId(space.id);
  };

  const removeSpace = (id: string) => {
    const next = draft.filter((space) => space.id !== id);
    setDraft(next);
    setSelectedId(next[0]?.id ?? null);
  };

  const move = (id: string, delta: number) => {
    const index = draft.findIndex((space) => space.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setDraft(next);
  };

  const toggleProject = (space: Space, projectId: string, on: boolean) =>
    update(space.id, {
      projectIds: on
        ? [...space.projectIds, projectId]
        : space.projectIds.filter((id) => id !== projectId),
    });

  const valid =
    draft.length > 0 && draft.every((space) => space.name.trim().length > 0);

  const save = async () => {
    const rpc = getRpc();
    if (!rpc || !valid) return;
    setSaving(true);
    try {
      const next = await rpc.call("spaces_save", {
        spaces: draft.map((space) => ({ ...space, name: space.name.trim() })),
        showOthersInMore,
      });
      setSpacesState(next);
      onOpenChange(false);
    } catch (cause) {
      toast.error(
        `Spaces: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  // Folders dropped on the Projects list become projects, checked in the
  // selected space of the draft (saved with the rest on Save).
  const drop = useFolderDropTarget((folders) => {
    const target = selectedId;
    void addDroppedFolders(folders, null).then((result) => {
      if (!result || target === null) return;
      const ids = result.results
        .map((r) => r.projectId)
        .filter((id): id is string => id !== undefined);
      setDraft((spaces) =>
        spaces.map((space) =>
          space.id === target
            ? { ...space, projectIds: [...new Set([...space.projectIds, ...ids])] }
            : space,
        ),
      );
    });
  });

  const ownerOf = (projectId: string) =>
    draft.filter((space) => space.projectIds.includes(projectId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        onOpenAutoFocus={(event) => {
          // Start in the name field instead of ringing the first list row.
          event.preventDefault();
          nameInput.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit Spaces</DialogTitle>
          <DialogDescription>
            Each space shows only its projects in the sidebar. A project that
            is in no space shows in every space. While a space is active the
            thread list is grouped by project; All projects restores your
            grouping.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-80 gap-4">
          <div className="flex w-48 shrink-0 flex-col gap-1">
            {draft.map((space, index) => (
              <button
                key={space.id}
                type="button"
                onClick={() => setSelectedId(space.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  space.id === selectedId
                    ? "bg-state-active font-medium"
                    : "hover:bg-state-hover",
                )}
              >
                <Icon
                  name={space.icon ?? DEFAULT_SPACE_ICON}
                  aria-hidden="true"
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">
                  {space.name || "Untitled"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {spaceShortcutLabel(index)}
                </span>
              </button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start gap-2 text-muted-foreground"
              disabled={draft.length >= MAX_SPACES}
              onClick={addSpace}
            >
              <Icon name="Plus" aria-hidden="true" className="size-4" />
              Add space
            </Button>
          </div>

          {selected ? (
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex items-center gap-2">
                <Input
                  ref={nameInput}
                  aria-label="Space name"
                  value={selected.name}
                  maxLength={40}
                  onChange={(event) =>
                    update(selected.id, { name: event.target.value })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move up"
                  onClick={() => move(selected.id, -1)}
                >
                  <Icon name="ArrowUp" aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move down"
                  onClick={() => move(selected.id, 1)}
                >
                  <Icon name="ArrowDown" aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${selected.name}`}
                  disabled={draft.length <= 1}
                  onClick={() => removeSpace(selected.id)}
                >
                  <Icon name="Trash2" aria-hidden="true" className="size-4" />
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Icon
                </span>
                <div className="flex flex-wrap gap-1">
                  {SPACE_ICONS.map((name) => {
                    const current =
                      (selected.icon ?? DEFAULT_SPACE_ICON) === name;
                    return (
                      <Button
                        key={name}
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Icon ${name}`}
                        aria-pressed={current}
                        className={cn(
                          "size-8",
                          current && "bg-state-active text-foreground",
                        )}
                        onClick={() => update(selected.id, { icon: name })}
                      >
                        <Icon name={name} aria-hidden="true" className="size-4" />
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div
                className={cn(
                  "-m-1 flex min-h-0 flex-col gap-2 rounded-md p-1 transition-colors",
                )}
                data-testid="spaces-edit-folder-drop"
                {...drop.handlers}
              >
                <span className="text-xs font-medium text-muted-foreground">
                  Projects
                </span>
                <div
                  aria-hidden="true"
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border border-dashed px-3 py-3 text-center text-xs text-muted-foreground transition-colors",
                    drop.over
                      ? "border-ring bg-state-hover text-foreground"
                      : "border-border",
                  )}
                >
                  <Icon name="FolderPlus" aria-hidden="true" className="size-5" />
                  <span className="font-medium">
                    {drop.over
                      ? `Drop to add to ${selected.name || "this space"}`
                      : "Drag folders here"}
                  </span>
                  <span>
                    Each folder becomes a project in{" "}
                    {selected.name || "this space"}
                  </span>
                </div>
                <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                  {state.projects.map((project) => {
                    const checked = selected.projectIds.includes(project.id);
                    const others = ownerOf(project.id)
                      .filter((space) => space.id !== selected.id)
                      .map((space) => space.name);
                    return (
                      <label
                        key={project.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-state-hover"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            toggleProject(selected, project.id, value === true)
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {project.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {others.length > 0
                            ? `${checked ? "also in" : "in"} ${others.join(", ")}`
                            : ownerOf(project.id).length === 0
                              ? "all spaces"
                              : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={showOthersInMore}
            onCheckedChange={(value) => setShowOthersInMore(value === true)}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">
              Show other spaces’ projects under More
            </span>
            <span className="text-xs text-muted-foreground">
              Off: the thread list shows only the current space. More still
              appears if you hide a group yourself.
            </span>
          </span>
        </label>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!valid || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
