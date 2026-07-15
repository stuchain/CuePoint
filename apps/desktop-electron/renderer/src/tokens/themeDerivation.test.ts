import { describe, expect, it } from "vitest";
import { NEO_DARK_EDITOR_COLORS } from "./customThemes";
import {
  darken,
  deriveThemeTokens,
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
    expect(tokens["fg-inverse"]).toBe("#ffffff");
    expect(tokens["bg-toolbar"]).toBeTruthy();
    expect(tokens["bg-panel-alt"]).toBeTruthy();
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
