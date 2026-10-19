import { afterEach, describe, expect, it } from "vitest";

import { NEO_DARK_EDITOR_COLORS, createEmptyCustomTheme, type CustomTheme } from "../tokens/customThemes";
import keyColours from "../tokens/keyColours.css?raw";
import { applyCustomThemeColors, applyTheme } from "../tokens/theme";
import { DERIVED_THEME_TOKEN_KEYS, deriveThemeTokens, deriveWithSeed } from "../tokens/themeDerivation";
import { THEMES } from "../test/themeFixtures";
import { colorsInUse, seedFromPage, toHex } from "./themeSeed";

afterEach(() => {
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-theme");
});

describe("the colors a new custom theme starts from", () => {
  it("reads plain colors in either spelling", () => {
    expect(toHex("#ABC")).toBe("#aabbcc");
    expect(toHex(" #18181B ")).toBe("#18181b");
    expect(toHex("rgb(24, 24, 27)")).toBe("#18181b");
    expect(toHex("color-mix(in srgb, red 50%, blue)")).toBeNull();
    expect(toHex("rgb(300, 0, 0)")).toBeNull();
  });

  it("is the theme on screen, so the editor opens on what the app already looks like", () => {
    const root = document.documentElement;
    const tokens: Record<string, string> = {
      "--bg-app": "#101010",
      "--bg-panel": "#202020",
      "--bg-input": "#303030",
      "--fg-primary": "#ffffff",
      "--fg-muted": "#999999",
      "--accent-primary": "#ef785b",
      "--accent-success": "#22c55e",
      "--accent-warning": "#eab308",
      "--accent-danger": "#ef4444",
    };
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
    expect(colorsInUse(root)).toMatchObject({ bgApp: "#101010", accentPrimary: "#ef785b", fgMuted: "#999999" });
  });

  it("falls back to the Neo dark palette when a token is not a plain color", () => {
    expect(colorsInUse(document.documentElement)).toEqual(NEO_DARK_EDITOR_COLORS);
  });
});

/** Every `--name: value;` of a stylesheet block, as a theme sets it. */
function declarationsOf(css: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    found[match[1]!] = match[2]!.trim();
  }
  return found;
}

/** The 24 key colours of a theme: its own block of keyColours.css. */
function keyColoursOf(theme: string): Record<string, string> {
  const start = keyColours.indexOf(`[data-theme="${theme}"]`);
  return declarationsOf(keyColours.slice(start, keyColours.indexOf("}", start)));
}

function showTheme(theme: string): Record<string, string> {
  const tokens = { ...declarationsOf(THEMES[theme]!), ...keyColoursOf(theme) };
  const root = document.documentElement;
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(`--${name}`, value);
  return tokens;
}

describe("a custom theme started from a built-in one (C95)", () => {
  it.each(Object.keys(THEMES))("copies %s exactly: zero differences in every token it sets", (theme) => {
    const shown = showTheme(theme);
    const seed = seedFromPage();
    const custom = deriveWithSeed(seed.colors, seed);
    const differing = DERIVED_THEME_TOKEN_KEYS.filter((key) => shown[key] !== undefined && custom[key] !== shown[key]);
    expect(differing).toEqual([]);
    // Re-deriving from nine colours, as it was before, moves tokens (the reason for the seed).
    const rederived = deriveThemeTokens(seed.colors);
    expect(DERIVED_THEME_TOKEN_KEYS.filter((key) => shown[key] !== undefined && rederived[key] !== shown[key]).length).toBeGreaterThan(5);
  });

  it("moves only what depends on a changed swatch", () => {
    const shown = showTheme("retro16");
    const seed = seedFromPage();
    const custom = deriveWithSeed({ ...seed.colors, accentWarning: "#ff0000" }, seed);
    const moved = DERIVED_THEME_TOKEN_KEYS.filter((key) => shown[key] !== undefined && custom[key] !== shown[key]);
    expect(moved).toContain("accent-warning");
    expect(moved.length).toBeLessThanOrEqual(3);
    expect(custom["bg-panel"]).toBe(shown["bg-panel"]);
    expect(custom["border-muted"]).toBe(shown["border-muted"]);
  });

  it("falls back to the line colour for a theme that sets no table line", () => {
    showTheme("neoDark");
    expect(seedFromPage().tokens["row-divider"]).toBe(seedFromPage().tokens["border-muted"]);
  });

  it("is kept with a theme made from the one on screen, and not with a re-derived one", () => {
    showTheme("clubNeon");
    const made = createEmptyCustomTheme("Mine", colorsInUse());
    expect(made.seed?.tokens["border-muted"]).toBe("#50507a");
    const withoutSeed: CustomTheme = { ...made, seed: undefined };
    expect(deriveWithSeed(made.colors, made.seed)["border-muted"]).toBe("#50507a");
    expect(deriveWithSeed(withoutSeed.colors, withoutSeed.seed)["border-muted"]).not.toBe("#50507a");
  });

  it("starts the editor's preview from the theme that was on screen", () => {
    document.documentElement.removeAttribute("style");
    document.documentElement.dataset.theme = "retro16";
    const shown = showTheme("retro16");
    applyCustomThemeColors({ ...colorsInUse(), accentWarning: "#ff0000" }, "editor-preview");
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--border-muted")).toBe(shown["border-muted"]);
    expect(root.style.getPropertyValue("--accent-warning")).toBe("#ff0000");
    applyTheme("neoDark");
    expect(root.style.getPropertyValue("--border-muted")).toBe("");
  });
});
