import { describe, expect, it } from "vitest";

import { NEO_DARK_EDITOR_COLORS } from "./customThemes";
import { CUSTOM_PALETTES, THEMES, themeTokens } from "../test/themeFixtures";
import { contrastRatio, deriveThemeTokens } from "./themeDerivation";

/**
 * Contrast floors for every theme (G6 step 1, R2-6/R2-7/T5/T13/T16): the surface ladder, the
 * divider, the muted and greyed text, the fill, status, link and focus tokens. Computed from the
 * themes' own values, not a browser.
 *
 * Built-in themes are held to every floor. A custom theme goes through `deriveThemeTokens`
 * and is held to the floors the derivation controls: the panel-alt step, border-muted, the
 * fills, fg-on-status, link, focus ring, fg-disabled and color-scheme. Where the floor is
 * about a colour the user chose, a custom theme is exempt:
 *  - app -> panel step (bg-app and bg-panel are the user's);
 *  - --fg-muted 4.5:1 (the user's own text colour);
 *  - accent and success 3:1 on the panel (the user's accent and success colours);
 *  - the warning/accent hue gap (both are the user's);
 *  - a floor no colour could meet on those surfaces (a mid-tone grey page has no 4.5:1 link
 *    colour at all; dark user status colours have no 4.5:1 text colour but white): the floor is
 *    lowered to what black or white reaches, never below. Built-ins never get this relief.
 *  - "alt is further from the page than the panel" when the panel is pure white or black: the alt
 *    surface then has to step back towards the page.
 */
const BUILT_IN: [string, Record<string, string>][] = Object.entries(THEMES).map(([name, css]) => [
  name,
  themeTokens(css),
]);
const CUSTOM: [string, Record<string, string>][] = [
  ["custom neo dark editor colors", deriveThemeTokens(NEO_DARK_EDITOR_COLORS)],
  ...CUSTOM_PALETTES.map(([name, colors]) => [name, deriveThemeTokens(colors)] as [string, Record<string, string>]),
];

/** What the best of black and white reaches as the worst case over `backgrounds`. */
function bestReachable(backgrounds: string[]): number {
  const worst = (c: string) => Math.min(...backgrounds.map((b) => contrastRatio(c, b)));
  return Math.max(worst("#000000"), worst("#ffffff"));
}
/** The floor, lowered to what any colour could reach on these surfaces. */
const reachable = (floor: number, backgrounds: string[]) => Math.min(floor, bestReachable(backgrounds) - 1e-6);

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const hueGap = (a: string, b: string) => {
  const gap = Math.abs(hue(a) - hue(b));
  return Math.min(gap, 360 - gap);
};

describe.each([...BUILT_IN, ...CUSTOM])("contrast floors in %s", (name, t) => {
  const builtIn = name in THEMES;
  const app = t["bg-app"]!;
  const panel = t["bg-panel"]!;
  const alt = t["bg-panel-alt"]!;
  const toolbar = t["bg-toolbar"]!;
  /** Built-ins are held to the floor; a custom theme to what any colour could reach. */
  const floor = (min: number, backgrounds: string[]) => (builtIn ? min : reachable(min, backgrounds));

  it("steps the surface ladder away from the page", () => {
    if (builtIn) expect(contrastRatio(app, panel), "app to panel").toBeGreaterThanOrEqual(1.05);
    expect(contrastRatio(panel, alt), "panel to alt").toBeGreaterThanOrEqual(1.15);
    if (panel !== "#ffffff" && panel !== "#000000") {
      expect(contrastRatio(app, alt), "alt is further from the page than the panel").toBeGreaterThan(contrastRatio(app, panel));
    }
  });

  it("draws --border-muted at 1.5:1 on the panel", () => {
    expect(contrastRatio(t["border-muted"]!, panel)).toBeGreaterThanOrEqual(1.5);
  });

  it("keeps --accent-info at 3:1 on the panel", () => {
    expect(contrastRatio(t["accent-info"]!, panel)).toBeGreaterThanOrEqual(floor(3, [panel]));
  });

  it("reads accent and success at 3:1 on the panel", () => {
    if (!builtIn) return;
    expect(contrastRatio(t["accent-primary"]!, panel), "accent").toBeGreaterThanOrEqual(3);
    expect(contrastRatio(t["accent-success"]!, panel), "success").toBeGreaterThanOrEqual(3);
  });

  it("reads muted text at 4.5:1 and greyed text at 3:1 on the panel", () => {
    if (builtIn) expect(contrastRatio(t["fg-muted"]!, panel), "muted").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t["fg-disabled"]!, panel), "disabled").toBeGreaterThanOrEqual(floor(3, [panel]));
  });

  it("reads text on the button fills at 4.5:1", () => {
    expect(contrastRatio(t["fg-inverse"]!, t["accent-fill"]!), "fg-inverse on accent-fill").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t["fg-primary"]!, t["danger-fill"]!), "fg-primary on danger-fill").toBeGreaterThanOrEqual(4.5);
  });

  it("reads --fg-on-status at 4.5:1 on every status colour", () => {
    const statuses = ["accent-success", "accent-warning", "accent-info", "accent-danger"].map((k) => t[k]!);
    for (const status of ["accent-success", "accent-warning", "accent-info", "accent-danger"]) {
      expect(contrastRatio(t["fg-on-status"]!, t[status]!), status).toBeGreaterThanOrEqual(floor(4.5, statuses));
    }
  });

  it("reads --link at 4.5:1 on the panel and the page", () => {
    for (const [surface, colour] of [["panel", panel], ["app", app]] as const) {
      expect(contrastRatio(t["link"]!, colour), surface).toBeGreaterThanOrEqual(floor(4.5, [panel, app]));
    }
  });

  it("draws --focus-ring-color at 3:1 on the page, panel, alt panel and toolbar", () => {
    const surfaces = { app, panel, alt, toolbar };
    for (const [surface, colour] of Object.entries(surfaces)) {
      expect(contrastRatio(t["focus-ring-color"]!, colour), surface).toBeGreaterThanOrEqual(
        floor(3, Object.values(surfaces)),
      );
    }
  });

  it("keeps the warning colour a hue apart from the accent", () => {
    if (!builtIn) return;
    expect(hueGap(t["accent-warning"]!, t["accent-primary"]!)).toBeGreaterThanOrEqual(10);
  });
});

describe("--color-scheme", () => {
  it.each(Object.entries(THEMES))("is dark in %s", (_name, css) => {
    expect(css).toMatch(/--color-scheme:\s*dark;/);
  });

  it("follows the page's luminance when derived", () => {
    // Light where black text reads better on the page (luminance above about 0.18).
    const light = ["custom light", "custom mid grey", "custom light panel at white"];
    expect(deriveThemeTokens(NEO_DARK_EDITOR_COLORS)["color-scheme"]).toBe("dark");
    for (const [name, colors] of CUSTOM_PALETTES) {
      expect(deriveThemeTokens(colors)["color-scheme"], name).toBe(light.includes(name) ? "light" : "dark");
    }
  });
});
