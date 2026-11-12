import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../server";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { PROJECT_LIST_ACTION_BUTTON_CLASS } from "@/components/ui/sidebar-row-classes";
import { EditSpacesDialog } from "./EditSpacesDialog.js";
import { DEFAULT_SPACE_ICON } from "./space-icons.js";

const ALL_PROJECTS_ICON = "GridView";
import {
  setEditorOpen,
  setRpc,
  setSpacesState,
  showAllProjects,
  switchSpace,
  useEditorOpen,
  useSpacesState,
} from "./spaces-store.js";

export { SPACE_SHORTCUT_COUNT, spaceShortcutLabel } from "./shortcuts.js";
import { spaceShortcutLabel } from "./shortcuts.js";

function reportError(cause: unknown) {
  toast.error(
    `Spaces: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
}

/** Loads state, keeps it fresh, and publishes the RPC client for commands. */
export function useSpacesConnection() {
  const rpc = useRpc<typeof rpcContract>();
  const refetch = useCallback(() => {
    rpc.call("state_get").then(setSpacesState, reportError);
  }, [rpc]);
  useEffect(() => {
    setRpc(rpc);
    refetch();
    return () => setRpc(null);
  }, [rpc, refetch]);
  useRealtime("spaces-changed", refetch);
  useEffect(() => {
    window.addEventListener("focus", refetch);
    const timer = window.setInterval(refetch, 15_000);
    return () => {
      window.removeEventListener("focus", refetch);
      window.clearInterval(timer);
    };
  }, [refetch]);
  return rpc;
}

const HIDE_MORE_STYLE_ID = "bb-spaces-hide-more";
const HIDE_MORE_CSS = `
div:has(> [data-testid="sidebar-thread-list-more-row"]),
[data-testid="sidebar-thread-list-more-row"] { display: none !important; }
`;

function useHideMore(hide: boolean) {
  useEffect(() => {
    if (!hide) return;
    const style = document.createElement("style");
    style.id = HIDE_MORE_STYLE_ID;
    style.textContent = HIDE_MORE_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, [hide]);
}

export function SpaceSwitcher(_props: { controlSize: number }) {
  useSpacesConnection();
  const state = useSpacesState();
  const editorOpen = useEditorOpen();
  const [menuOpen, setMenuOpen] = useState(false);
  useHideMore(
    state !== null &&
      state.activeSpaceId !== null &&
      !state.showOthersInMore &&
      !state.hasUserHiddenGroups,
  );

  const spaces = state?.spaces ?? [];
  const active =
    spaces.find((space) => space.id === state?.activeSpaceId) ?? null;
  const label = state === null ? "Spaces" : (active?.name ?? "All projects");
  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="spaces-switcher"
            aria-label={`Space: ${label}`}
            className={cn(
              PROJECT_LIST_ACTION_BUTTON_CLASS,
              "group/space w-auto min-w-0 flex-1 pr-2 font-semibold text-foreground",
            )}
          >
            <Icon
              name={active ? (active.icon ?? DEFAULT_SPACE_ICON) : ALL_PROJECTS_ICON}
              aria-hidden="true"
              className="size-4 shrink-0"
            />
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            <Icon
              name="ChevronDown"
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 opacity-0 transition-opacity",
                "group-hover/space:opacity-60 group-focus-visible/space:opacity-60 group-data-[state=open]/space:opacity-60",
              )}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          // Same 1px gap as thread rows in the sidebar list (space-y-px).
          className="min-w-52 space-y-px"
        >
          {spaces.map((space, index) => {
            const isActive = space.id === state?.activeSpaceId;
            const shortcut = spaceShortcutLabel(index);
            return (
              <DropdownMenuItem
                key={space.id}
                role="menuitemradio"
                aria-checked={isActive}
                className={cn(isActive && "bg-state-active")}
                onSelect={() => {
                  if (!isActive) switchSpace(space.id).catch(reportError);
                }}
              >
                <Icon
                  name={space.icon ?? DEFAULT_SPACE_ICON}
                  aria-hidden="true"
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">{space.name}</span>
                {shortcut ? (
                  <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>
                ) : null}
              </DropdownMenuItem>
            );
          })}
          {spaces.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            role="menuitemradio"
            aria-checked={state?.activeSpaceId === null}
            className={cn(state?.activeSpaceId === null && "bg-state-active")}
            onSelect={() => {
              if (state?.activeSpaceId !== null) showAllProjects().catch(reportError);
            }}
          >
            <Icon name={ALL_PROJECTS_ICON} aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">All projects</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditorOpen(true)}>
            <Icon name="Settings" aria-hidden="true" className="size-4 shrink-0" />
            <span>Edit Spaces…</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {state ? (
        <EditSpacesDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          state={state}
        />
      ) : null}
    </>
  );
}
