/**
 * The page's colour before its stylesheets load (M492): `index.html` paints the stored theme's
 * `--bg-app`, so the window never flashes a colour that is not the app's.
 *
 * The page cannot import the theme code before it has loaded, so the colours are written out in
 * `index.html`; this keeps them equal to the themes'.
 */
import { describe, expect, it } from "vitest";

import indexHtml from "../../index.html?raw";
import clubNeon from "../tokens/themes/clubNeon.css?raw";
import mutedPro from "../tokens/themes/mutedPro.css?raw";
import neoDark from "../tokens/themes/neoDark.css?raw";
import qtEvolved from "../tokens/themes/qtEvolved.css?raw";
import retro16 from "../tokens/themes/retro16.css?raw";
import { BUILT_IN_THEME_OPTIONS, DEFAULT_THEME, getThemeBackground } from "../tokens/theme";

const SHEETS: Record<string, string> = { neoDark, retro16, qtEvolved, clubNeon, mutedPro };

describe("the page's colour before its stylesheets load", () => {
  it("starts as the default theme's background", () => {
    const start = /<style id="boot-background">\s*html\s*\{\s*background:\s*(#[0-9a-f]{6});/i.exec(indexHtml);
    expect(start?.[1]).toBe(getThemeBackground(DEFAULT_THEME));
  });

  it.each(BUILT_IN_THEME_OPTIONS.map((theme) => theme.id))("knows %s's background", (id) => {
    const written = new RegExp(`${id}:\\s*"(#[0-9a-f]{6})"`, "i").exec(indexHtml);
    expect(written?.[1]).toBe(getThemeBackground(id));
    // And that is the theme's own --bg-app.
    const sheet = SHEETS[id]!;
    expect(/--bg-app:\s*(#[0-9a-f]{6})/i.exec(sheet)?.[1]).toBe(written?.[1]);
  });

  it("reads the stored theme and the custom themes by the keys the app writes", () => {
    expect(indexHtml).toContain('localStorage.getItem("cuepoint-ui-lab-theme")');
    expect(indexHtml).toContain('localStorage.getItem("cuepoint-ui-lab-custom-themes")');
  });

  it("is not failed by storage that throws", () => {
    expect(indexHtml).toMatch(/catch \(error\)/);
  });
});
