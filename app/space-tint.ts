// Space tints: a hue mixed into the sidebar while a space is active, so Work
// can feel cool and Personal warm.
//
// Only the sidebar is tinted; the content area keeps the theme's own canvas
// (white stays white). We read the sidebar tokens the active theme and mode
// resolve to, mix the tint into each, and override them on <html> with a more
// specific selector than the theme's `:root`/`.dark`, so it works on top of
// any theme, light or dark.
import { useEffect } from "react";
import type { Space } from "../server";

export type SpaceTint = NonNullable<Space["tint"]>;

/** OKLCH hue of each tint, in menu order. */
export const SPACE_TINTS: Record<SpaceTint, number> = {
  blue: 255,
  teal: 195,
  green: 150,
  yellow: 95,
  orange: 60,
  red: 25,
  pink: 350,
  purple: 300,
};

export function tintColor(tint: SpaceTint): string {
  return `oklch(68% 0.15 ${SPACE_TINTS[tint]})`;
}

const STYLE_ID = "bb-spaces-tint";
/** Share of the tint (%) in each sidebar token, per mode. */
const STRENGTH: Record<"light" | "dark", Record<string, number>> = {
  light: { "--sidebar": 5, "--sidebar-accent": 7, "--sidebar-border": 6 },
  dark: { "--sidebar": 5, "--sidebar-accent": 7, "--sidebar-border": 5 },
};
const SURFACE_TOKENS = Object.keys(STRENGTH.light);

/** Chroma added to each sidebar text token; its lightness stays the theme's. */
const TEXT_CHROMA: Record<string, number> = {
  "--sidebar-foreground": 0.02,
  "--foreground": 0.02,
  "--muted-foreground": 0.035,
  "--subtle-foreground": 0.035,
  "--readback-foreground": 0.035,
};
const TEXT_TOKENS = Object.keys(TEXT_CHROMA);

/** Where the text tint applies: bb's sidebar and the Edit Spaces list. */
export const SIDEBAR_SCOPE_ATTR = "data-spaces-sidebar";
const TEXT_SCOPE = `[data-sidebar="sidebar"], [${SIDEBAR_SCOPE_ATTR}]`;

let activeTint: SpaceTint | null = null;
let previewTint: SpaceTint | null | undefined;
let style: HTMLStyleElement | null = null;
let observer: MutationObserver | null = null;

function effectiveTint(): SpaceTint | null {
  return previewTint !== undefined ? previewTint : activeTint;
}

/** Tokens as the theme resolves them on <html>, without our override. */
function readTokens(tokens: string[]): Record<string, string> {
  if (style?.sheet) style.sheet.disabled = true;
  const computed = getComputedStyle(document.documentElement);
  const values: Record<string, string> = {};
  for (const token of tokens) {
    values[token] = computed.getPropertyValue(token).trim();
  }
  if (style?.sheet) style.sheet.disabled = false;
  return values;
}

function rule(selector: string, lines: string[]): string {
  return lines.length > 0 ? `${selector} {\n${lines.join("\n")}\n}\n` : "";
}

function cssFor(tint: SpaceTint): string {
  const base = readTokens([...SURFACE_TOKENS, ...TEXT_TOKENS]);
  const dark = document.documentElement.classList.contains("dark");
  const strength = dark ? STRENGTH.dark : STRENGTH.light;
  const color = tintColor(tint);
  const hue = SPACE_TINTS[tint];
  const surfaces = SURFACE_TOKENS.filter((token) => base[token]).map(
    (token) =>
      `  ${token}: color-mix(in oklab, ${base[token]}, ${color} ${strength[token]}%);`,
  );
  // Relative color keeps each text tier's lightness, so contrast is unchanged.
  const text = TEXT_TOKENS.filter((token) => base[token]).map(
    (token) =>
      `  ${token}: oklch(from ${base[token]} l calc(c + ${TEXT_CHROMA[token]}) ${hue});`,
  );
  return rule("html:root", surfaces) + rule(TEXT_SCOPE, text);
}

function render() {
  const tint = effectiveTint();
  if (tint === null) {
    teardown();
    return;
  }
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  const css = cssFor(tint);
  if (style.textContent !== css) style.textContent = css;
  if (!observer) {
    // Re-read the anchors when the theme stylesheet or light/dark mode changes.
    observer = new MutationObserver((records) => {
      const own = records.every(
        (record) => style !== null && style.contains(record.target),
      );
      if (!own) render();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
}

function teardown() {
  observer?.disconnect();
  observer = null;
  style?.remove();
  style = null;
}

/** Tint of the active space; null for none or All projects. */
export function useSpaceTint(tint: SpaceTint | null) {
  useEffect(() => {
    activeTint = tint;
    render();
  }, [tint]);
  useEffect(
    () => () => {
      activeTint = null;
      previewTint = undefined;
      teardown();
    },
    [],
  );
}

/** Show a tint while choosing one; undefined goes back to the active space. */
export function previewSpaceTint(tint: SpaceTint | null | undefined) {
  previewTint = tint;
  render();
}
