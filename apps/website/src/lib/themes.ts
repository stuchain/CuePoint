/**
 * The app's five themes (theme.ts: BUILT_IN_THEME_OPTIONS). The site wears one, the default, Neo Dark: the
 * owner chose on 2026-10-09 to drop the header's theme switch (it was DEC-190's), so a visitor sees one
 * palette. The list stays because the tokens are still generated for all five (scripts/sync-tokens.mjs)
 * and the stills and the styleguide are still drawn in each.
 */
export const THEMES = [
  { id: "neoDark", label: "Neo dark" },
  { id: "retro16", label: "Retro 16-bit" },
  { id: "qtEvolved", label: "Classic" },
  { id: "clubNeon", label: "Club neon" },
  { id: "mutedPro", label: "Muted" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "neoDark";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}
