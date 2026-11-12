// Space icons bb does not ship, from the free Hugeicons set (stroke-rounded,
// the same family as bb's own icons). Registered app-wide under a "Spaces"
// prefix so they render through experimental_Icon like built-in names.
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Airplane01Icon,
  Book02Icon,
  Briefcase01Icon,
  Camera01Icon,
  Dumbbell01Icon,
  GamepadIcon,
  GraduationCapIcon,
  HeartIcon,
  IdeaIcon,
  Leaf01Icon,
  Moon02Icon,
  MusicNote01Icon,
  OfficeIcon,
  PenTool02Icon,
  Rocket01Icon,
  UserGroupIcon,
  Video01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import type { PluginAppBuilder } from "@get-bb/plugin-sdk/app";

export const CUSTOM_SPACE_ICONS = {
  SpacesAirplane: Airplane01Icon,
  SpacesBook: Book02Icon,
  SpacesBriefcase: Briefcase01Icon,
  SpacesCamera: Camera01Icon,
  SpacesDumbbell: Dumbbell01Icon,
  SpacesGamepad: GamepadIcon,
  SpacesGraduation: GraduationCapIcon,
  SpacesHeart: HeartIcon,
  SpacesIdea: IdeaIcon,
  SpacesLeaf: Leaf01Icon,
  SpacesMoon: Moon02Icon,
  SpacesMusic: MusicNote01Icon,
  SpacesOffice: OfficeIcon,
  SpacesPen: PenTool02Icon,
  SpacesRocket: Rocket01Icon,
  SpacesTeam: UserGroupIcon,
  SpacesVideo: Video01Icon,
  SpacesWallet: Wallet01Icon,
} satisfies Record<string, IconSvgElement>;

export function registerSpaceIcons(app: PluginAppBuilder) {
  for (const [name, icon] of Object.entries(CUSTOM_SPACE_ICONS)) {
    app.experimental_icons.register({
      name,
      component: ({ className }: { className?: string }) => (
        <HugeiconsIcon
          icon={icon}
          className={className}
          color="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      ),
    });
  }
}
