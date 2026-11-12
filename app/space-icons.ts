// Icons offered in Edit Spaces: three rows of 11 — work, making things, life.
// Plain names are bb's built-in icons; "Spaces…" names are registered by this
// plugin (app/custom-icons.tsx). An unknown name falls back to a lightning
// bolt, so names that left this list still render for spaces that use them.
export const SPACE_ICONS = [
  // Work
  "SpacesBriefcase", "Laptop", "SpacesOffice", "Code", "SpacesRocket",
  "ChartColumn", "Megaphone02", "Target", "Toolbox", "SpacesTeam",
  "SpacesWallet",
  // Making and learning
  "Palette", "SpacesPen", "SpacesCamera", "SpacesMusic", "Mic", "SpacesVideo",
  "News01", "SpacesBook", "SpacesGraduation", "SpacesIdea", "Brain",
  // Life
  "Home", "Coffee", "SpacesHeart", "SpacesGamepad", "SpacesDumbbell",
  "SpacesAirplane", "Globe", "SpacesLeaf", "SpacesMoon", "Star", "Layers",
] as const;

export const DEFAULT_SPACE_ICON = "Layers";
