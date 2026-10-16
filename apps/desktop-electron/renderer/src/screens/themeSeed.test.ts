import { afterEach, describe, expect, it } from "vitest";

import { NEO_DARK_EDITOR_COLORS } from "../tokens/customThemes";
import { colorsInUse, toHex } from "./themeSeed";

afterEach(() => document.documentElement.removeAttribute("style"));

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
