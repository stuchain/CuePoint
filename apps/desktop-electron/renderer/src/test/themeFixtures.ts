import clubNeon from "../tokens/themes/clubNeon.css?raw";
import mutedPro from "../tokens/themes/mutedPro.css?raw";
import neoDark from "../tokens/themes/neoDark.css?raw";
import qtEvolved from "../tokens/themes/qtEvolved.css?raw";
import retro16 from "../tokens/themes/retro16.css?raw";
import { NEO_DARK_EDITOR_COLORS, type CustomThemeColors } from "../tokens/customThemes";

/** The five built-in themes' CSS, and the seeded custom palettes, shared by the contrast tests. */
export const THEMES: Record<string, string> = { clubNeon, mutedPro, neoDark, qtEvolved, retro16 };

export function themeTokens(css: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8});/g)) {
    found[match[1]!] = match[2]!;
  }
  return found;
}

/**
 * Seeded custom palettes, shared by the contrast tests: a light theme, mid-tones (the second is the
 * one the old two-step derivation left at 2.46:1), a saturated accent, a near-black page, dark
 * user status colours, and a light panel at white (the extreme, where the alt surface cannot step
 * away from the page). Every theme, built-in or custom, sets --tab-underline-color: the accent,
 * moved only as far as 3:1 on the toolbar needs, so a custom theme never inherits a built-in
 * theme's underline.
 */
export const palette = (bgApp: string, bgPanel: string, bgInput: string, fg: string, muted: string, accent: string): CustomThemeColors => ({
  ...NEO_DARK_EDITOR_COLORS,
  bgApp,
  bgPanel,
  bgInput,
  fgPrimary: fg,
  fgMuted: muted,
  accentPrimary: accent,
});
export const CUSTOM_PALETTES: [string, CustomThemeColors][] = [
  ["custom light", palette("#f2f2f5", "#e4e4ea", "#ffffff", "#1a1a1f", "#5a5a66", "#2563eb")],
  ["custom mid blue", palette("#4d72b5", "#5b7dbb", "#3f5f99", "#ffffff", "#dbe4f5", "#f59e0b")],
  ["custom mid grey", palette("#808080", "#8c8c8c", "#707070", "#ffffff", "#e8e8e8", "#1d4ed8")],
  ["custom mid green", palette("#4a7c59", "#5a8c69", "#3f6b4d", "#ffffff", "#e0f0e5", "#fbbf24")],
  ["custom saturated", palette("#1a0033", "#2d0a55", "#12001f", "#ffffff", "#c9b6e6", "#ff00cc")],
  ["custom near-black", palette("#000000", "#0a0a0a", "#050505", "#ffffff", "#b0b0b0", "#00e5ff")],
  ["custom light panel at white", palette("#e0e0e0", "#ffffff", "#ffffff", "#1a1a1f", "#5a5a66", "#2563eb")],
  [
    "custom dark status colours",
    {
      ...palette("#18181b", "#27272a", "#18181b", "#fafafa", "#a1a1aa", "#8b5cf6"),
      accentDanger: "#7f1d1d",
      accentSuccess: "#14532d",
    },
  ],
];

