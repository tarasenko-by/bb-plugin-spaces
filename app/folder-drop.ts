// Dropping folders from the file manager onto Spaces.
//
// The browser hides a dropped folder's full path (Electron removed File.path
// and bb's preload does not expose webUtils), so we send the folder's name
// and the server finds it on disk. When a path is available (older Electron,
// or text paths dragged from an address bar) it is sent too.
import { useCallback, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import type { DroppedFolder, FolderResult, SpacesState } from "../server";
import { getRpc, setSpacesState } from "./spaces-store.js";

/** True while the drag carries files from outside the app. */
export function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function textPaths(data: DataTransfer): string[] {
  const uriList = data.getData("text/uri-list");
  const fromUris = uriList
    .split(/\r?\n/)
    .filter((line) => line.startsWith("file:"))
    .map((uri) => {
      try {
        const path = decodeURIComponent(new URL(uri).pathname);
        // file:///C:/x → C:/x on Windows.
        return /^\/[A-Za-z]:/.test(path) ? path.slice(1) : path;
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  return fromUris;
}

const baseName = (path: string) =>
  path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path;

/** Read dropped folders. Must run synchronously inside the drop handler. */
export function readDroppedFolders(data: DataTransfer): {
  folders: DroppedFolder[];
  skippedFiles: number;
} {
  const folders: DroppedFolder[] = [];
  let skippedFiles = 0;
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry && !entry.isDirectory) {
      skippedFiles += 1;
      continue;
    }
    const file = item.getAsFile();
    const legacyPath = (file as (File & { path?: string }) | null)?.path;
    const name = entry?.name ?? file?.name;
    if (!name) continue;
    folders.push(legacyPath ? { name, path: legacyPath } : { name });
  }
  if (folders.length === 0) {
    for (const path of textPaths(data)) {
      folders.push({ name: baseName(path), path });
    }
  }
  return { folders, skippedFiles };
}

function summarize(results: FolderResult[], spaceName: string | null) {
  const added = results.filter(
    (r) => r.status === "created" || r.status === "existing",
  );
  const created = results.filter((r) => r.status === "created").length;
  const problems = results.filter(
    (r) => r.status === "not_found" || r.status === "failed",
  );
  if (added.length > 0) {
    const where = spaceName ? ` to ${spaceName}` : "";
    const names = added.map((r) => r.name).join(", ");
    toast.success(
      `Added ${added.length} project${added.length === 1 ? "" : "s"}${where}`,
      {
        description:
          created < added.length
            ? `${names} (${added.length - created} already existed)`
            : names,
      },
    );
  }
  for (const problem of problems) {
    toast.error(`Spaces: ${problem.name} — ${problem.message ?? problem.status}`, {
      description:
        problem.status === "not_found"
          ? "Add it with New project, then put it in the space in Edit Spaces."
          : problem.path,
    });
  }
}

/** Create projects from folders and optionally put them in a space. */
export async function addDroppedFolders(
  folders: DroppedFolder[],
  space: { id: string; name: string } | null,
): Promise<{ state: SpacesState; results: FolderResult[] } | null> {
  const rpc = getRpc();
  if (!rpc || folders.length === 0) return null;
  const pending = toast.loading(
    `Adding ${folders.length} folder${folders.length === 1 ? "" : "s"}…`,
  );
  try {
    const result = await rpc.call("folders_add", {
      folders,
      ...(space ? { spaceId: space.id } : {}),
    });
    setSpacesState(result.state);
    summarize(result.results, space?.name ?? null);
    return result;
  } catch (cause) {
    toast.error(
      `Spaces: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    return null;
  } finally {
    toast.dismiss(pending);
  }
}

/**
 * Drag handlers for one drop target. `onFolders` gets the folders on drop;
 * `over` is true while a file drag hovers the target.
 */
export function useFolderDropTarget(
  onFolders: (folders: DroppedFolder[]) => void,
) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const onDragEnter = useCallback((event: DragEvent) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    depth.current += 1;
    setOver(true);
  }, []);
  const onDragOver = useCallback((event: DragEvent) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }, []);
  const onDragLeave = useCallback((event: DragEvent) => {
    if (!isFileDrag(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  }, []);
  const onDrop = useCallback(
    (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      depth.current = 0;
      setOver(false);
      const { folders, skippedFiles } = readDroppedFolders(event.dataTransfer);
      if (folders.length === 0) {
        toast.error(
          skippedFiles > 0
            ? "Spaces: drop folders, not files"
            : "Spaces: nothing to add",
        );
        return;
      }
      onFolders(folders);
    },
    [onFolders],
  );
  return { over, handlers: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
