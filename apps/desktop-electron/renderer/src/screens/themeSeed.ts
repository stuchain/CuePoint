import { NEO_DARK_EDITOR_COLORS, type CustomThemeColors } from "../tokens/customThemes";

/** The CSS tokens each editor colour is read from. */
const TOKENS: Record<keyof CustomThemeColors, string> = {
  bgApp: "--bg-app",
  bgPanel: "--bg-panel",
  bgInput: "--bg-input",
  fgPrimary: "--fg-primary",
  fgMuted: "--fg-muted",
  accentPrimary: "--accent-primary",
  accentSuccess: "--accent-success",
  accentWarning: "--accent-warning",
  accentDanger: "--accent-danger",
};

/** "#rrggbb" from "#rgb", "#rrggbb" or "rgb(r, g, b)"; null for anything else (a color-mix, a name). */
export function toHex(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+[\d.]+%?)?\s*\)$/.exec(text);
  if (!rgb) return null;
  const parts = [rgb[1], rgb[2], rgb[3]].map((part) => Number(part));
  if (parts.some((n) => n > 255)) return null;
  return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The nine colors the theme in use is drawn with, read from the page, so a new custom theme starts
 * as exactly what is on screen: opening the editor changes nothing until a color is changed.
 * Falls back to the Neo dark palette when a token cannot be read as a plain color.
 */
export function colorsInUse(root: HTMLElement = document.documentElement): CustomThemeColors {
  try {
    const style = getComputedStyle(root);
    const found: Partial<CustomThemeColors> = {};
    for (const key of Object.keys(TOKENS) as (keyof CustomThemeColors)[]) {
      const hex = toHex(style.getPropertyValue(TOKENS[key]));
      if (hex === null) return { ...NEO_DARK_EDITOR_COLORS };
      found[key] = hex;
    }
    return found as CustomThemeColors;
  } catch {
    return { ...NEO_DARK_EDITOR_COLORS };
  }
}
