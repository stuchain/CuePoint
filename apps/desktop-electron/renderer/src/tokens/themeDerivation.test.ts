import { describe, expect, it } from "vitest";
import { NEO_DARK_EDITOR_COLORS } from "./customThemes";
import {
  betterText,
  contrastRatio,
  darken,
  deriveThemeTokens,
  holdContrast,
  lighten,
  normalizeHex,
  pickContrastText,
} from "./themeDerivation";

describe("themeDerivation", () => {
  it("normalizes short hex codes", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("#18181b")).toBe("#18181b");
  });

  it("derives full token set from editor colors", () => {
    const tokens = deriveThemeTokens(NEO_DARK_EDITOR_COLORS);
    expect(tokens["bg-app"]).toBe("#18181b");
    expect(tokens["accent-primary"]).toBe("#8b5cf6");
    expect(tokens["border-outline"]).toBe("#000000");
    expect(tokens["fg-inverse"]).toBe("#000000"); // black reads better on #8b5cf6 (5.2:1 against 4.1:1)
    expect(tokens["bg-toolbar"]).toBeTruthy();
    expect(tokens["bg-panel-alt"]).toBeTruthy();
    expect(tokens["border-control"]).toBeTruthy();
    expect(tokens["tab-underline-color"]).toBe("#8b5cf6");
  });

  it("pickContrastText returns black on light backgrounds", () => {
    expect(pickContrastText("#ffffff")).toBe("#000000");
    expect(pickContrastText("#18181b")).toBe("#ffffff");
  });

  it("darken and lighten adjust channels", () => {
    expect(darken("#808080", 0.5)).toBe("#404040");
    expect(lighten("#000000", 1)).toBe("#ffffff");
  });
});

describe("the contrast-held tokens", () => {
  it("steps panel-alt away from the page: lighter in a dark theme, darker in a light one", () => {
    const dark = deriveThemeTokens(NEO_DARK_EDITOR_COLORS);
    expect(contrastRatio(dark["bg-panel"]!, dark["bg-panel-alt"]!)).toBeGreaterThanOrEqual(1.15);
    expect(contrastRatio(dark["bg-app"]!, dark["bg-panel-alt"]!)).toBeGreaterThan(contrastRatio(dark["bg-app"]!, dark["bg-panel"]!));
    const light = deriveThemeTokens({ ...NEO_DARK_EDITOR_COLORS, bgApp: "#f2f2f5", bgPanel: "#e4e4ea" });
    expect(contrastRatio(light["bg-panel"]!, light["bg-panel-alt"]!)).toBeGreaterThanOrEqual(1.15);
    expect(contrastRatio(light["bg-app"]!, light["bg-panel-alt"]!)).toBeGreaterThan(contrastRatio(light["bg-app"]!, light["bg-panel"]!));
  });

  it("derives a colour scheme from the page's luminance", () => {
    expect(deriveThemeTokens(NEO_DARK_EDITOR_COLORS)["color-scheme"]).toBe("dark");
    expect(deriveThemeTokens({ ...NEO_DARK_EDITOR_COLORS, bgApp: "#ffffff" })["color-scheme"]).toBe("light");
  });

  it("holdContrast keeps a colour that already holds and moves one that does not", () => {
    expect(holdContrast("#ffffff", ["#000000"], 4.5)).toBe("#ffffff");
    const moved = holdContrast("#404040", ["#202020"], 4.5);
    expect(contrastRatio(moved, "#202020")).toBeGreaterThanOrEqual(4.5);
  });

  it("holdContrast darkens on a light page, nudges without bleaching, and returns an end when unreachable", () => {
    const darker = holdContrast("#9ca3af", ["#ffffff"], 4.5);
    expect(contrastRatio(darker, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(darker).not.toBe("#000000");
    const nudged = holdContrast("#8b5cf6", ["#27272a"], 4.5);
    expect(nudged).not.toBe("#ffffff");
    expect(["#000000", "#ffffff"]).toContain(holdContrast("#808080", ["#808080", "#8c8c8c"], 7));
  });

  it("betterText picks black or white by contrast", () => {
    expect(betterText("#f59e0b")).toBe("#000000");
    expect(betterText("#18181b")).toBe("#ffffff");
  });

  it("keeps black status text when white would fall further on the lightest status colour", () => {
    // Dark user success and danger colours push black under 4.5:1 there, but white is worse on the warning yellow.
    const t = deriveThemeTokens({ ...NEO_DARK_EDITOR_COLORS, accentDanger: "#7f1d1d", accentSuccess: "#14532d" });
    const statuses = ["accent-success", "accent-warning", "accent-info", "accent-danger"].map((k) => t[k]!);
    const worst = (text: string) => Math.min(...statuses.map((c) => contrastRatio(text, c)));
    expect(worst("#000000")).toBeLessThan(4.5);
    expect(t["fg-on-status"]).toBe(worst("#000000") >= worst("#ffffff") ? "#000000" : "#ffffff");
  });

  it("derives the new tokens for the whole set", () => {
    const tokens = deriveThemeTokens(NEO_DARK_EDITOR_COLORS);
    for (const key of ["accent-fill", "danger-fill", "fg-on-status", "link", "focus-ring-color", "color-scheme"]) {
      expect(tokens[key], key).toBeTruthy();
    }
  });
});
