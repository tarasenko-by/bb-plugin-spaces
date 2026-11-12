import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract, Space, SpacesState } from "../server";
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
import {
  PROJECT_LIST_ACTION_BUTTON_CLASS,
  SIDEBAR_RAIL_BUTTON_CLASS,
} from "@/components/ui/sidebar-row-classes";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EditSpacesDialog } from "./EditSpacesDialog.js";
import { DEFAULT_SPACE_ICON } from "./space-icons.js";
import { useSpaceTint } from "./space-tint.js";
import { useLastThreadPerSpace } from "./last-thread.js";

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

export function SpaceSwitcher({ controlSize }: { controlSize: number }) {
  useSpacesConnection();
  const state = useSpacesState();
  const editorOpen = useEditorOpen();
  useHideMore(
    state !== null &&
      state.activeSpaceId !== null &&
      !state.showOthersInMore &&
      !state.hasUserHiddenGroups,
  );
  const active =
    state?.spaces.find((space) => space.id === state.activeSpaceId) ?? null;
  useSpaceTint(active?.tint ?? null);
  useLastThreadPerSpace(state);

  return (
    <>
      {state?.switcherStyle === "icons" ? (
        <SpaceIconBar state={state} controlSize={controlSize} />
      ) : (
        <SpaceMenu state={state} active={active} />
      )}
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

/** The current space as a button that opens a menu of every space. */
function SpaceMenu({
  state,
  active,
}: {
  state: SpacesState | null;
  active: Space | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const spaces = state?.spaces ?? [];
  const label = state === null ? "Spaces" : (active?.name ?? "All projects");
  return (
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
  );
}

const ICON_GAP_PX = 2;
/** All projects and Edit Spaces always stay in the row. */
const FIXED_ICON_COUNT = 2;

/**
 * One icon per space, then All projects and Edit Spaces. Spaces that do not
 * fit are left out (they stay reachable by shortcut); the active space is
 * always shown, and the last two icons never hide.
 */
function SpaceIconBar({
  state,
  controlSize,
}: {
  state: SpacesState;
  controlSize: number;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const slots = Math.floor((width + ICON_GAP_PX) / (controlSize + ICON_GAP_PX));
  const room = Math.max(0, slots - FIXED_ICON_COUNT);
  let visible = state.spaces.slice(0, room);
  const activeIndex = state.spaces.findIndex(
    (space) => space.id === state.activeSpaceId,
  );
  if (room > 0 && activeIndex >= room) {
    visible = [...visible.slice(0, room - 1), state.spaces[activeIndex]!];
  }

  return (
    <TooltipProvider>
      <div
        ref={row}
        data-testid="spaces-switcher"
        role="toolbar"
        aria-label="Spaces"
        className="flex min-w-0 flex-1 items-center overflow-hidden"
        style={{ gap: ICON_GAP_PX }}
      >
        {visible.map((space) => {
          const index = state.spaces.indexOf(space);
          const shortcut = spaceShortcutLabel(index);
          const isActive = space.id === state.activeSpaceId;
          return (
            <IconBarButton
              key={space.id}
              label={shortcut ? `${space.name} (${shortcut})` : space.name}
              icon={space.icon ?? DEFAULT_SPACE_ICON}
              active={isActive}
              size={controlSize}
              onClick={() => {
                if (!isActive) switchSpace(space.id).catch(reportError);
              }}
            />
          );
        })}
        <div className="flex-1" />
        <IconBarButton
          label="All projects"
          icon={ALL_PROJECTS_ICON}
          active={state.activeSpaceId === null}
          size={controlSize}
          onClick={() => {
            if (state.activeSpaceId !== null) showAllProjects().catch(reportError);
          }}
        />
        <IconBarButton
          label="Edit Spaces…"
          icon="Settings"
          active={false}
          size={controlSize}
          onClick={() => setEditorOpen(true)}
        />
      </div>
    </TooltipProvider>
  );
}

function IconBarButton({
  label,
  icon,
  active,
  size,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  size: number;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={SIDEBAR_RAIL_BUTTON_CLASS}
          style={{ width: size, height: size }}
          onClick={onClick}
        >
          <Icon name={icon} aria-hidden="true" className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
