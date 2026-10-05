import { describe, expect, it } from "vitest";

import clubNeon from "./themes/clubNeon.css?raw";
import mutedPro from "./themes/mutedPro.css?raw";
import neoDark from "./themes/neoDark.css?raw";
import qtEvolved from "./themes/qtEvolved.css?raw";
import retro16 from "./themes/retro16.css?raw";
import { NEO_DARK_EDITOR_COLORS, type CustomThemeColors } from "./customThemes";
import {
  DERIVED_THEME_TOKEN_KEYS,
  WAVEFORM_MIN_CONTRAST,
  contrastRatio,
  deriveThemeTokens,
  withContrast,
} from "./themeDerivation";

/**
 * The waveform's colours (WAVE-05): in every built-in theme and derived for
 * every custom one, each band standing at 3:1 or more against the panel it is
 * drawn on, so a waveform is never a smudge on a theme someone chose.
 */

const THEMES: Record<string, string> = { clubNeon, mutedPro, neoDark, qtEvolved, retro16 };

const WAVEFORM_TOKENS = [
  "waveform-low",
  "waveform-mid",
  "waveform-high",
  "waveform-mono",
  "waveform-played",
  "waveform-grid",
  "waveform-memory-cue",
];

/** The drawn bands: the three of "Three bands" and the one of "One colour". */
const BAND_TOKENS = ["waveform-low", "waveform-mid", "waveform-high", "waveform-mono"];

function tokens(css: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    found[match[1]!] = match[2]!.trim();
  }
  return found;
}

/** Three custom themes: the editor's own, a light one, and a panel in the low band's hue. */
const CUSTOM: Record<string, CustomThemeColors> = {
  neoDark: NEO_DARK_EDITOR_COLORS,
  light: {
    bgApp: "#f5f5f5",
    bgPanel: "#ffffff",
    bgInput: "#ffffff",
    fgPrimary: "#111111",
    fgMuted: "#666666",
    accentPrimary: "#ffd400",
    accentSuccess: "#16a34a",
    accentWarning: "#ca8a04",
    accentDanger: "#dc2626",
  },
  blue: {
    bgApp: "#1e3a8a",
    bgPanel: "#3b82f6",
    bgInput: "#1e40af",
    fgPrimary: "#eff6ff",
    fgMuted: "#bfdbfe",
    accentPrimary: "#3b82f6",
    accentSuccess: "#22c55e",
    accentWarning: "#f59e0b",
    accentDanger: "#ef4444",
  },
};

describe("the waveform's colours", () => {
  it.each(Object.keys(THEMES))("%s declares every waveform token", (name) => {
    const found = tokens(THEMES[name]!);
    for (const token of WAVEFORM_TOKENS) expect(found[token], token).toBeTruthy();
  });

  it.each(Object.keys(THEMES))("%s draws each band at 3:1 against its panel", (name) => {
    const found = tokens(THEMES[name]!);
    for (const token of BAND_TOKENS) {
      expect(contrastRatio(found[token]!, found["bg-panel"]!), `${name} ${token}`).toBeGreaterThanOrEqual(
        WAVEFORM_MIN_CONTRAST,
      );
    }
  });

  it.each(Object.keys(CUSTOM))("a custom theme like %s derives every band at 3:1", (name) => {
    const derived = deriveThemeTokens(CUSTOM[name]!);
    for (const token of WAVEFORM_TOKENS) expect(derived[token], token).toBeTruthy();
    for (const token of BAND_TOKENS) {
      expect(contrastRatio(derived[token]!, derived["bg-panel"]!), `${name} ${token}`).toBeGreaterThanOrEqual(
        WAVEFORM_MIN_CONTRAST,
      );
    }
  });

  it("applies and clears the derived waveform tokens with the rest", () => {
    for (const token of WAVEFORM_TOKENS) {
      expect(DERIVED_THEME_TOKEN_KEYS as readonly string[]).toContain(token);
    }
  });

  it("dims the played part with the panel itself", () => {
    expect(deriveThemeTokens(NEO_DARK_EDITOR_COLORS)["waveform-played"]).toMatch(
      /^rgba\(\d+, \d+, \d+, 0\.6\)$/,
    );
  });

  it("keeps a colour that already stands out, and moves one that does not", () => {
    expect(withContrast("#ffffff", "#000000")).toBe("#ffffff");
    const moved = withContrast("#3b82f6", "#3b82f6");
    expect(moved).not.toBe("#3b82f6");
    expect(contrastRatio(moved, "#3b82f6")).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(withContrast("#ffd400", "#ffffff"), "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("measures contrast as WCAG does", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});
