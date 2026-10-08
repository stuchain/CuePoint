import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEMES, isThemeId, themeInitScript } from "./themes";

const here = dirname(fileURLToPath(import.meta.url));
const generatedCss = readFileSync(join(here, "..", "styles", "tokens.generated.css"), "utf8");
const appThemeTs = readFileSync(
  join(here, "..", "..", "..", "desktop-electron", "renderer", "src", "tokens", "theme.ts"),
  "utf8",
);

describe("theme ids stay in step", () => {
  const ids = THEMES.map((t) => t.id);

  it("equal the theme blocks of tokens.generated.css", () => {
    const blocks = [...generatedCss.matchAll(/\[data-theme="([^"]+)"\]/g)].map((m) => m[1]);
    expect([...new Set(blocks)].sort()).toEqual([...ids].sort());
  });

  it("equal the app's BUILT_IN_THEME_OPTIONS (theme.ts, read as text)", () => {
    const list = /BUILT_IN_THEME_OPTIONS\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(appThemeTs)?.[1] ?? "";
    const appIds = [...list.matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(appIds).toEqual(ids);
  });
});

describe("themes", () => {
  it("offers the app's five themes with Neo Dark first and default", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["neoDark", "retro16", "qtEvolved", "clubNeon", "mutedPro"]);
    expect(DEFAULT_THEME).toBe("neoDark");
    expect(isThemeId("retro16")).toBe(true);
    expect(isThemeId("custom:x")).toBe(false);
  });

  it("the init script applies a stored theme and survives blocked storage", () => {
    const run = (get: () => string | null) => {
      const el = { attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } };
      new Function("localStorage", "document", themeInitScript())({ getItem: get }, { documentElement: el });
      return el.attrs["data-theme"];
    };
    expect(run(() => "clubNeon")).toBe("clubNeon");
    expect(run(() => "nonsense")).toBeUndefined();
    expect(run(() => { throw new Error("blocked"); })).toBeUndefined();
  });
});
