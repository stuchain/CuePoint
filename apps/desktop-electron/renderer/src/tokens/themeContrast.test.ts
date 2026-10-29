import { describe, expect, it } from "vitest";

import { NEO_DARK_EDITOR_COLORS } from "./customThemes";
import { CUSTOM_PALETTES, THEMES, themeTokens } from "../test/themeFixtures";
import { INFO_MIN_HUE_GAP, SELECTED_ACCENT_MIX, contrastRatio, deriveThemeTokens } from "./themeDerivation";

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
/** The themes whose `--border-muted` D10 tunes (DECISIONS-FOR-MOCKUPS D10, option A). */
const D10_TUNED_LINES = ["qtEvolved", "clubNeon", "retro16"];
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
    // M330 (D29): page to panel steps by 1.15:1 in every built-in theme (Club neon and Classic were 1.08).
    if (builtIn) expect(contrastRatio(app, panel), "app to panel").toBeGreaterThanOrEqual(1.15);
    // Only Retro's slabs are below 1.15: D10 (C93) set them to 1.14:1, no louder than a panel. Its hover
    // does not lean on them (see --hover-fill below). Every other theme keeps the 1.15 floor.
    expect(contrastRatio(panel, alt), "panel to alt").toBeGreaterThanOrEqual(name === "retro16" ? 1.1 : 1.15);
    if (panel !== "#ffffff" && panel !== "#000000") {
      expect(contrastRatio(app, alt), "alt is further from the page than the panel").toBeGreaterThan(contrastRatio(app, panel));
    }
  });

  it("draws --border-muted at 1.5:1 on the panel", () => {
    expect(contrastRatio(t["border-muted"]!, panel)).toBeGreaterThanOrEqual(1.5);
  });

  // D10 tunes the line of Classic, Club neon and Retro only. Neo dark and Muted keep their
  // specified borders (#52525b, #4b5568), which sit outside 2.2 to 2.8:1, so they are not held to it.
  it("draws the line of a theme D10 tunes at 2.2 to 2.8:1 on the panel and 2:1 or more on the page (C93)", () => {
    if (!D10_TUNED_LINES.includes(name)) return;
    const onPanel = contrastRatio(t["border-muted"]!, panel);
    expect(onPanel, "line on panel").toBeGreaterThanOrEqual(2.2);
    expect(onPanel, "line on panel").toBeLessThanOrEqual(2.8);
    expect(contrastRatio(t["border-muted"]!, app), "line on page").toBeGreaterThanOrEqual(2);
  });

  it("draws Retro's table rows with a quiet line, so the page does not read as a grid (D10, C93)", () => {
    if (name !== "retro16") return;
    const rows = t["row-divider"]!;
    // M319: the line was 1.26:1 once mixed into the rows; it is now the colour the rows get, 1.5 to 1.7.
    expect(contrastRatio(rows, t["bg-input"]!), "row line on the rows").toBeLessThanOrEqual(1.7);
    expect(contrastRatio(rows, t["bg-input"]!)).toBeLessThan(contrastRatio(t["border-muted"]!, t["bg-input"]!));
  });

  it("draws every table row line at 1.5:1 or more on the rows, as unmixed (M319, M329)", () => {
    if (!builtIn) return;
    expect(contrastRatio(t["row-divider"]!, t["bg-input"]!)).toBeGreaterThanOrEqual(1.5);
  });

  it("keeps the soft row line quieter than the strong divider (M329: two line roles)", () => {
    if (!builtIn) return;
    expect(contrastRatio(t["row-divider"]!, t["bg-input"]!)).toBeLessThan(contrastRatio(t["border-muted"]!, t["bg-input"]!));
  });

  it("keeps info a hue of its own, 30 degrees from the accent (M327, D28)", () => {
    for (const accent of ["accent-primary", "accent-fill"]) {
      expect(hueGap(t["accent-info"]!, t[accent]!), `info to ${accent}`).toBeGreaterThanOrEqual(INFO_MIN_HUE_GAP);
    }
  });

  it("gives writing its own green, not the success green (M331)", () => {
    if (!builtIn) return;
    expect(t["accent-write"]).not.toBe(t["accent-success"]);
  });

  it("reads the disabled main action's words at 4.5:1 on its fill (M324)", () => {
    const fill = mixHex(t["accent-fill"]!, panel, 22);
    const words = mixHex(t["fg-primary"]!, fill, 70);
    if (builtIn) expect(contrastRatio(words, fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("reads muted text on a hovered slab at 4.5:1 in the slab colour (M320)", () => {
    if (!builtIn) return;
    const fill = t["hover-fill"] ?? alt;
    const words = mixHex(t["fg-muted"]!, t["fg-primary"]!, 80);
    expect(contrastRatio(words, fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("reads muted text at 4.5:1 on a hovered row: 6% of the text colour over the rows (M320, M337)", () => {
    if (!builtIn) return;
    const row = mixHex(t["fg-primary"]!, t["bg-input"]!, 6);
    expect(contrastRatio(t["fg-muted"]!, row)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the specified line in the themes D10 leaves alone", () => {
    const spec: Record<string, string> = { neoDark: "#52525b", mutedPro: "#4b5568" };
    if (name in spec) expect(t["border-muted"]).toBe(spec[name]);
  });

  it("draws a hover fill of 1.3:1 or more against the page, and in Retro against the tab strip too", () => {
    if (!builtIn) return;
    // `--hover-fill` is the panel-alt surface unless a theme sets its own (Retro does: its slabs are
    // too close to a panel to show a hover).
    const fill = t["hover-fill"] ?? alt;
    expect(contrastRatio(fill, app), "hover on page").toBeGreaterThanOrEqual(1.3);
    if (name === "retro16") {
      expect(t["hover-fill"], "Retro sets its own").toBeDefined();
      expect(contrastRatio(fill, toolbar), "hover on the tab strip").toBeGreaterThanOrEqual(1.3);
      expect(contrastRatio(fill, panel), "hover on a panel").toBeGreaterThanOrEqual(1.3);
    }
  });

  // Answer 4 (P67): Retro's hover fill was one step too light for muted text (3.99:1 while hovered); it is
  // lifted one step so plain muted text keeps 4.5:1 on it. The other themes read muted text as
  // --fg-muted-on-slab on their fills (tested below).
  it("keeps muted text at 4.5:1 on Retro's hover fill", () => {
    if (name !== "retro16") return;
    expect(contrastRatio(t["fg-muted"]!, t["hover-fill"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("puts the toolbar between the page and the panel (C94)", () => {
    if (!builtIn) return;
    const lum = (hex: string) => contrastRatio(hex, "#000000");
    expect(lum(toolbar)).toBeGreaterThanOrEqual(lum(app));
    expect(lum(toolbar)).toBeLessThan(lum(panel));
  });

  it("separates the toolbar from both the page and the panel, 1.07:1 each way (M330, D29)", () => {
    if (!builtIn) return;
    expect(contrastRatio(app, toolbar), "page to toolbar").toBeGreaterThanOrEqual(1.07);
    expect(contrastRatio(toolbar, panel), "toolbar to panel").toBeGreaterThanOrEqual(1.07);
  });

  it("draws the tab underline in the accent fill, one accent and not a third (M327, D28)", () => {
    if (!builtIn || !t["tab-underline-color"]) return;
    // The fill, unless the fill is under the underline's 3:1 on the toolbar (selectionContrast.test.ts):
    // then the accent itself. Never a colour of its own.
    const fillReads = contrastRatio(t["accent-fill"]!, toolbar) >= 3;
    expect(t["tab-underline-color"]).toBe(fillReads ? t["accent-fill"] : t["accent-primary"]);
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
    expect(contrastRatio(t["fg-on-accent"]!, t["accent-fill"]!), "fg-on-accent on accent-fill").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t["fg-primary"]!, t["danger-fill"]!), "fg-primary on danger-fill").toBeGreaterThanOrEqual(4.5);
  });

  it("reads --fg-on-status at 4.5:1 on every status colour", () => {
    const statuses = ["accent-success", "accent-warning", "accent-info", "accent-danger"].map((k) => t[k]!);
    for (const status of ["accent-success", "accent-warning", "accent-info", "accent-danger"]) {
      expect(contrastRatio(t["fg-on-status"]!, t[status]!), status).toBeGreaterThanOrEqual(floor(4.5, statuses));
    }
  });

  it("reads text on the write green at 4.5:1 (D14)", () => {
    expect(t["accent-write"], "accent-write is declared").toBeTruthy();
    expect(contrastRatio(t["fg-on-status"]!, t["accent-write"]!), "fg-on-status on accent-write").toBeGreaterThanOrEqual(4.5);
  });

  it("reads a keycap's text (--fg-primary on --bg-panel-alt) at 4.5:1 (C102)", () => {
    if (!builtIn) return; // the text and the surface are the user's own colours
    expect(contrastRatio(t["fg-primary"]!, alt)).toBeGreaterThanOrEqual(4.5);
  });

  it("veils a dialog's backdrop at 0.7 (C103)", () => {
    expect(t["overlay-backdrop"] ?? "rgba(0, 0, 0, 0.7)").toBe("rgba(0, 0, 0, 0.7)");
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

  it("keeps every accent colour 40 degrees of hue from the warning and the danger colour", () => {
    // An accent near amber or red reads as a state (a button that looks like an error), so the
    // accent, its fill, the link, the focus ring and the tab underline all keep their distance.
    if (!builtIn) return;
    for (const accent of ["accent-primary", "accent-fill", "link", "focus-ring-color", "tab-underline-color"]) {
      if (!t[accent]) continue;
      for (const status of ["accent-warning", "accent-danger", "danger-fill"]) {
        expect(hueGap(t[accent]!, t[status]!), `${accent} to ${status}`).toBeGreaterThanOrEqual(40);
      }
    }
  });
});

/** `color-mix(in srgb, <top> <percent>%, <base>)`, as the stylesheets write it. */
function mixHex(top: string, base: string, percent: number): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(1 + at * 2, 3 + at * 2), 16);
  const out = [0, 1, 2].map((at) =>
    Math.round((channel(top, at) * percent + channel(base, at) * (100 - percent)) / 100)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${out.join("")}`;
}

/**
 * The pairs the consistency build added or fixed (areas 3, 18, 52), for the five built-in themes:
 * muted text on every chrome surface, the accent and the danger colour as text on the table
 * rows' surface, the one chip (Badge.css) and the status text tokens (tokens.css).
 */
describe.each(BUILT_IN)("text pairs in %s", (_name, t) => {
  const surfaces: [string, string][] = [
    ["panel", t["bg-panel"]!],
    ["input", t["bg-input"]!],
    ["toolbar", t["bg-toolbar"]!],
  ];

  it("reads --fg-muted at 4.5:1 on the panel, the rows and the toolbar", () => {
    for (const [name, colour] of surfaces) {
      expect(contrastRatio(t["fg-muted"]!, colour), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  // P1, P67: the tone/line tokens of tokens.css, computed here from the theme's own values.
  it("reads --fg-muted-on-slab (muted lifted 20% towards the text) at 4.5:1 on the alt panel", () => {
    const words = mixHex(t["fg-muted"]!, t["fg-primary"]!, 80);
    expect(contrastRatio(words, t["bg-panel-alt"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("draws --divider-color (border-muted at 70% over the panel) at 1.3:1 or more on the panel", () => {
    const line = mixHex(t["border-muted"]!, t["bg-panel"]!, 70);
    expect(contrastRatio(line, t["bg-panel"]!)).toBeGreaterThanOrEqual(1.3);
  });

  it("reads the accent (the playing track's title, the first-steps chip) at 4.5:1 on the rows", () => {
    expect(contrastRatio(t["accent-primary"]!, t["bg-input"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("reads the danger colour at 4.5:1 on the rows", () => {
    expect(contrastRatio(t["accent-danger"]!, t["bg-input"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("draws the focus ring at 3:1 on a selected row", () => {
    const selected = mixHex(t["accent-primary"]!, t["bg-input"]!, SELECTED_ACCENT_MIX);
    expect(contrastRatio(t["focus-ring-color"]!, selected)).toBeGreaterThanOrEqual(3);
  });

  // The chip: the tone at --chip-fill-mix over what it sits on, its words the tone lifted
  // --chip-text-mix towards the text colour.
  it.each([
    ["success", "accent-success"],
    ["warning", "accent-warning"],
    ["danger", "accent-danger"],
    ["accent", "accent-primary"],
    ["neutral", "fg-muted"],
  ])("reads a %s chip's words at 4.5:1 on its tint over every surface", (_tone, token) => {
    const words = mixHex(t[token]!, t["fg-primary"]!, 35);
    for (const [name, colour] of [...surfaces, ["panel-alt", t["bg-panel-alt"]!] as [string, string]]) {
      // P6: --chip-fill-mix is 16% (was 20%).
      const fill = mixHex(t[token]!, colour, 16);
      expect(contrastRatio(words, fill), `${_tone} on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ["danger-text", "accent-danger"],
    ["success-text", "accent-success"],
    ["warning-text", "accent-warning"],
  ])("reads --%s (the status colour lifted towards the text) at 4.5:1 on the panel and the rows", (_token, base) => {
    const words = mixHex(t[base]!, t["fg-primary"]!, 60);
    for (const [name, colour] of surfaces) {
      expect(contrastRatio(words, colour), name).toBeGreaterThanOrEqual(4.5);
    }
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

describe("the :root fallback (TH-22)", () => {
  it("lives in Neo dark, the default theme, and the other themes only match their own attribute", () => {
    expect(THEMES.neoDark).toMatch(/^:root,\s*\[data-theme="neoDark"\]/m);
    for (const [name, css] of Object.entries(THEMES)) {
      if (name !== "neoDark") expect(css, name).not.toMatch(/(^|[\s,}]):root\b/m);
    }
  });
});

// ---------------------------------------------------------------------------------------------------
// HARDEN-08 (DEC-186): WCAG 2.2 AA for every text token in every theme.
// ---------------------------------------------------------------------------------------------------

type PairKind = "text" | "large-or-ui";
type Resolve = (t: Record<string, string>) => string;
interface ContrastPair {
  id: string;
  kind: PairKind;
  /** Resolves the foreground colour of the pair in a theme. */
  fg: Resolve;
  /** The surfaces it is drawn on, by name, resolved in a theme. */
  on: Record<string, Resolve>;
}

/** 4.5:1 is for text, 3:1 for large text, control borders, focus rings and other parts of a control (WCAG 1.4.3, 1.4.11). */
const FLOOR: Record<PairKind, number> = { text: 4.5, "large-or-ui": 3 };

const token = (name: string): Resolve => (t) => t[name]!;
/** The surfaces text is set on: the page, panels, rows, the toolbar, a hovered slab and a selected row. */
const SURFACES: Record<string, Resolve> = {
  "bg-app": token("bg-app"),
  "bg-panel": token("bg-panel"),
  "bg-panel-alt": token("bg-panel-alt"),
  "bg-input": token("bg-input"),
  "bg-toolbar": token("bg-toolbar"),
  "hover slab": (t) => t["hover-fill"] ?? t["bg-panel-alt"]!,
  "selected row": (t) => mixHex(t["accent-primary"]!, t["bg-input"]!, SELECTED_ACCENT_MIX),
};
const only = (...names: string[]): Record<string, Resolve> => Object.fromEntries(names.map((n) => [n, SURFACES[n]!]));
const onToken = (name: string): Record<string, Resolve> => ({ [name]: token(name) });

const CONTRAST_PAIRS: ContrastPair[] = [
  { id: "fg-primary", kind: "text", fg: token("fg-primary"), on: SURFACES },
  // On a hovered slab muted text is the lifted --fg-muted-on-slab (next pair), as the hover rules set it.
  { id: "fg-muted", kind: "text", fg: token("fg-muted"), on: only("bg-app", "bg-panel", "bg-panel-alt", "bg-input", "bg-toolbar", "selected row") },
  {
    id: "fg-muted-on-slab (muted lifted 20% towards the text)",
    kind: "text",
    fg: (t) => mixHex(t["fg-muted"]!, t["fg-primary"]!, 80),
    on: only("bg-panel-alt", "hover slab"),
  },
  // Greyed text is exempt from 1.4.3; the app holds it to the large-text 3:1 so it stays findable.
  { id: "fg-disabled", kind: "large-or-ui", fg: token("fg-disabled"), on: only("bg-app", "bg-panel", "bg-input", "bg-toolbar") },
  { id: "link", kind: "text", fg: token("link"), on: only("bg-app", "bg-panel", "bg-panel-alt", "bg-input", "bg-toolbar", "selected row") },
  { id: "accent-primary as text", kind: "text", fg: token("accent-primary"), on: only("bg-input", "selected row") },
  { id: "accent-primary as a mark", kind: "large-or-ui", fg: token("accent-primary"), on: only("bg-app", "bg-panel", "bg-toolbar") },
  { id: "accent-success as a mark", kind: "large-or-ui", fg: token("accent-success"), on: only("bg-panel", "bg-input") },
  { id: "accent-warning as a mark", kind: "large-or-ui", fg: token("accent-warning"), on: only("bg-panel", "bg-input") },
  { id: "accent-danger as text", kind: "text", fg: token("accent-danger"), on: only("bg-input") },
  { id: "accent-danger as a mark", kind: "large-or-ui", fg: token("accent-danger"), on: only("bg-panel") },
  { id: "accent-info as a mark", kind: "large-or-ui", fg: token("accent-info"), on: only("bg-panel", "bg-input") },
  ...(["danger", "success", "warning"] as const).map(
    (tone): ContrastPair => ({
      id: `${tone}-text (the status colour lifted 60% towards the text)`,
      kind: "text",
      fg: (t) => mixHex(t[`accent-${tone}`]!, t["fg-primary"]!, 60),
      on: only("bg-panel", "bg-input", "bg-toolbar"),
    }),
  ),
  { id: "fg-on-accent on accent-fill", kind: "text", fg: token("fg-on-accent"), on: onToken("accent-fill") },
  { id: "fg-primary on danger-fill", kind: "text", fg: token("fg-primary"), on: onToken("danger-fill") },
  {
    id: "fg-on-status",
    kind: "text",
    fg: token("fg-on-status"),
    on: {
      ...onToken("accent-success"),
      ...onToken("accent-warning"),
      ...onToken("accent-info"),
      ...onToken("accent-danger"),
      ...onToken("accent-write"),
    },
  },
  // Control borders (1.4.11): a field or button is found by its edge.
  { id: "border-control", kind: "large-or-ui", fg: token("border-control"), on: only("bg-app", "bg-panel", "bg-panel-alt", "bg-input", "bg-toolbar") },
  // The ring that shows where the keyboard is (2.4.7, 2.4.11, 1.4.11).
  { id: "focus-ring-color", kind: "large-or-ui", fg: token("focus-ring-color"), on: SURFACES },
  // The mark of the current tab (1.4.11).
  { id: "tab-underline-color", kind: "large-or-ui", fg: token("tab-underline-color"), on: only("bg-toolbar") },
];

/**
 * Pairs that fail today and need a colour change, which is a visual change and waits for the owner's go on a
 * mockup. Each is recorded in /mnt/project-files/phase18-hardening/a11y-findings.md under its finding id, with
 * the measured ratio here: the test passes while the ratio is what was measured or better, and fails if an entry
 * starts passing so the list shrinks as the colours are fixed. Nothing is skipped silently.
 * Key: `${theme} | ${pair id} | ${surface}`.
 */
const KNOWN_FAILING: Record<string, { finding: string; measured: number }> = {
  "clubNeon | accent-primary as text | selected row": { finding: "A11Y-C4", measured: 4.45 },
  "clubNeon | border-control | bg-panel-alt": { finding: "A11Y-C5", measured: 2.75 },
  "mutedPro | accent-primary as text | selected row": { finding: "A11Y-C4", measured: 3.76 },
  "mutedPro | border-control | bg-panel-alt": { finding: "A11Y-C5", measured: 2.8 },
  "mutedPro | fg-muted | bg-panel-alt": { finding: "A11Y-C1", measured: 4.29 },
  "mutedPro | fg-muted | selected row": { finding: "A11Y-C3", measured: 4.42 },
  "neoDark | accent-primary as text | selected row": { finding: "A11Y-C4", measured: 3.35 },
  "neoDark | border-control | bg-panel-alt": { finding: "A11Y-C5", measured: 2.16 },
  "neoDark | fg-muted | bg-panel-alt": { finding: "A11Y-C1", measured: 4.07 },
  "neoDark | link | bg-panel-alt": { finding: "A11Y-C2", measured: 3.84 },
  "qtEvolved | accent-primary as text | selected row": { finding: "A11Y-C4", measured: 3.31 },
  "qtEvolved | border-control | bg-panel-alt": { finding: "A11Y-C5", measured: 2.55 },
  "qtEvolved | fg-muted | bg-panel-alt": { finding: "A11Y-C1", measured: 3.73 },
  "qtEvolved | fg-muted | selected row": { finding: "A11Y-C3", measured: 4.38 },
  "qtEvolved | link | bg-panel-alt": { finding: "A11Y-C2", measured: 3.38 },
  "qtEvolved | link | selected row": { finding: "A11Y-C2", measured: 3.97 },
  "retro16 | accent-primary as text | selected row": { finding: "A11Y-C4", measured: 3.75 },
  "retro16 | focus-ring-color | hover slab": { finding: "A11Y-C6", measured: 2.81 },
};

const rounded = (value: number) => Math.round(value * 100) / 100;

describe("every text token against its surfaces, in every theme (HARDEN-08, DEC-186)", () => {
  for (const [theme, t] of BUILT_IN) {
    for (const pair of CONTRAST_PAIRS) {
      for (const [surface, resolve] of Object.entries(pair.on)) {
        const key = `${theme} | ${pair.id} | ${surface}`;
        it(`${key} reaches ${FLOOR[pair.kind]}:1`, () => {
          const exact = contrastRatio(pair.fg(t), resolve(t));
          const ratio = rounded(exact);
          const known = KNOWN_FAILING[key];
          // The floor is met by the exact ratio: 4.496 shown as 4.50 is still short of 4.5.
          if (exact >= FLOOR[pair.kind]) {
            expect(known, `${key} now passes at ${ratio}:1: delete its entry from KNOWN_FAILING`).toBeUndefined();
            return;
          }
          expect(known, `${key} fails at ${ratio}:1 and is not in KNOWN_FAILING`).toBeDefined();
          // `measured` is a ratio to two places, so half a hundredth of rounding is allowed.
          expect(exact, `${key} got worse than the measured ${known?.measured}:1`).toBeGreaterThanOrEqual(known!.measured - 0.005);
        });
      }
    }
  }

  it("lists only pairs that exist", () => {
    const keys = new Set<string>();
    for (const [theme] of BUILT_IN) {
      for (const pair of CONTRAST_PAIRS) for (const surface of Object.keys(pair.on)) keys.add(`${theme} | ${pair.id} | ${surface}`);
    }
    expect(Object.keys(KNOWN_FAILING).filter((key) => !keys.has(key))).toEqual([]);
  });

});

/**
 * A custom theme's derived colours are held to the same floors where the derivation controls them (the text,
 * surface and accent colours are the user's own and are exempt, as in the floors above): the link, the focus ring,
 * the control border, and the text on the accent fill, lowered to what black or white reaches on those surfaces.
 */
describe.each(CUSTOM)("derived pairs in %s (HARDEN-08)", (_name, t) => {
  it("reaches 4.5:1 for the link on the panel and the page, as far as any colour can", () => {
    const own = [t["bg-panel"]!, t["bg-app"]!];
    for (const surface of own) expect(contrastRatio(t["link"]!, surface)).toBeGreaterThanOrEqual(reachable(4.5, own));
  });
  it("reaches 3:1 for the focus ring on the page, panel, alt panel and toolbar, as far as any colour can", () => {
    const own = [t["bg-app"]!, t["bg-panel"]!, t["bg-panel-alt"]!, t["bg-toolbar"]!];
    for (const surface of own) expect(contrastRatio(t["focus-ring-color"]!, surface)).toBeGreaterThanOrEqual(reachable(3, own));
  });
  it("reaches 3:1 for the control border on the panel and the toolbar", () => {
    const own = [t["bg-panel"]!, t["bg-toolbar"]!];
    for (const surface of own) expect(contrastRatio(t["border-control"]!, surface)).toBeGreaterThanOrEqual(reachable(3, own));
  });
  it("reaches 4.5:1 for the text on the accent fill", () => {
    expect(contrastRatio(t["fg-on-accent"]!, t["accent-fill"]!)).toBeGreaterThanOrEqual(4.5);
  });
});
