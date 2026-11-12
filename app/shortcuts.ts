// Space shortcuts: Control+Alt+1…9 on every platform.
export const SPACE_SHORTCUT_COUNT = 9;

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * Label for the Control+Alt+N default, formatted like bb's own shortcut
 * hints: "⌃ ⌥ 1" on macOS, "Ctrl + Alt + 1" on Windows and Linux.
 */
export function spaceShortcutLabel(index: number): string | null {
  if (index >= SPACE_SHORTCUT_COUNT) return null;
  const key = String(index + 1);
  return isMacPlatform() ? `⌃ ⌥ ${key}` : `Ctrl + Alt + ${key}`;
}
