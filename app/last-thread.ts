// Reopen each space's last thread when switching to it.
//
// While a space is active, the thread the user opens is remembered for that
// space if it belongs there (its project is in the space, or in no space).
// Switching spaces — from the menu, a shortcut, the palette or `bb space` —
// opens the new space's remembered thread, if it still exists and is not
// archived. Remembered threads live in this browser's local storage.
import { useEffect, useRef } from "react";
import {
  experimental_useSidebarThreads,
  useBbContext,
  useBbNavigate,
} from "@get-bb/plugin-sdk/app";
import type { SpacesState } from "../server";

const STORAGE_KEY = "bb-spaces.lastThreads";

type LastThreads = Record<string, string>;

function load(): LastThreads {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as LastThreads) : {};
  } catch {
    return {};
  }
}

function remember(spaceId: string, threadId: string) {
  const all = load();
  if (all[spaceId] === threadId) return;
  all[spaceId] = threadId;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full or disabled: switching still works, it just won't reopen.
  }
}

/** A project shows in a space when it is in that space or in no space. */
function inSpace(state: SpacesState, spaceId: string, projectId: string) {
  const space = state.spaces.find((s) => s.id === spaceId);
  if (!space) return false;
  if (space.projectIds.includes(projectId)) return true;
  return !state.spaces.some((s) => s.projectIds.includes(projectId));
}

export function useLastThreadPerSpace(state: SpacesState | null) {
  const { threadId, projectId } = useBbContext();
  const navigate = useBbNavigate();
  const { threads } = experimental_useSidebarThreads();
  const activeSpaceId = state?.activeSpaceId ?? null;

  const stateRef = useRef(state);
  stateRef.current = state;
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  // Remember the opened thread for the active space. Keyed on the thread
  // only, so a space switch does not file the old space's thread under the
  // new space before navigation catches up.
  useEffect(() => {
    const current = stateRef.current;
    if (!current?.activeSpaceId || !threadId) return;
    const project =
      projectId ?? threadsRef.current.find((t) => t.id === threadId)?.projectId;
    if (!project || !inSpace(current, current.activeSpaceId, project)) return;
    remember(current.activeSpaceId, threadId);
  }, [threadId, projectId]);

  // On a switch (not on first load), open the new space's last thread.
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (state === null) return;
    const before = previous.current;
    previous.current = activeSpaceId;
    if (before === undefined || before === activeSpaceId || !activeSpaceId) {
      return;
    }
    const target = load()[activeSpaceId];
    if (!target || target === threadId) return;
    const live = threadsRef.current;
    // Skip threads that were archived or deleted since; while the list is
    // still empty (loading), trust the remembered id.
    if (live.length > 0 && !live.some((t) => t.id === target && !t.isArchived)) {
      return;
    }
    navigate.toThread(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpaceId, state === null]);
}
