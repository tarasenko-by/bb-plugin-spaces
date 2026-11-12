// Spaces — frontend entry.
//
// Registers a sidebar navigation that is bb's Rail (forked from the bundled
// Navigation plugin, app/nav/) plus an Arc-style space switcher in the
// sidebar header, and palette commands with Control+Alt+1…9 shortcuts (⌃⌥ on macOS).
import {
  definePluginApp,
  type ExperimentalSidebarHeaderProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Rail, RailNewThreadButton } from "./app/nav/Rail.js";
import { NewThreadRow, useNewThreadRowHost } from "./app/NewThreadRow.js";
import { SPACE_SHORTCUT_COUNT, SpaceSwitcher } from "./app/SpaceSwitcher.js";
import {
  getRpc,
  getSpacesState,
  setEditorOpen,
  showAllProjects,
  switchRelative,
  switchSpaceByIndex,
} from "./app/spaces-store.js";

function SpacesHeader({ controlSize }: ExperimentalSidebarHeaderProps) {
  const host = useNewThreadRowHost();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <SpaceSwitcher controlSize={controlSize} />
      {host ? (
        <NewThreadRow host={host} />
      ) : (
        <div className="flex min-w-0 flex-1">
          <RailNewThreadButton />
        </div>
      )}
    </div>
  );
}

function report(cause: unknown) {
  toast.error(
    `Spaces: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_sidebarNavigation({
    id: "rail",
    title: "Rail with Spaces",
    description: "bb's icon rail, with an Arc-style space switcher in the header",
    placement: "rail",
    component: Rail,
    headerComponent: SpacesHeader,
  });

  for (let index = 0; index < SPACE_SHORTCUT_COUNT; index += 1) {
    app.commands.register({
      id: `switch-${index + 1}`,
      title: `Switch to space ${index + 1}`,
      defaultShortcut: { key: String(index + 1), control: true, alt: true },
      isAvailable: () =>
        getRpc() !== null && (getSpacesState()?.spaces.length ?? 0) > index,
      run: () => {
        switchSpaceByIndex(index).catch(report);
      },
    });
  }
  app.commands.register({
    id: "next",
    title: "Next space",
    isAvailable: () => getRpc() !== null,
    run: () => {
      switchRelative(1).catch(report);
    },
  });
  app.commands.register({
    id: "previous",
    title: "Previous space",
    isAvailable: () => getRpc() !== null,
    run: () => {
      switchRelative(-1).catch(report);
    },
  });
  app.commands.register({
    id: "all",
    title: "Show all projects",
    isAvailable: () => getRpc() !== null && getSpacesState()?.activeSpaceId != null,
    run: () => {
      showAllProjects().catch(report);
    },
  });
  app.commands.register({
    id: "edit",
    title: "Edit Spaces…",
    isAvailable: () => getRpc() !== null,
    run: () => setEditorOpen(true),
  });
});
