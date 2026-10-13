import { describe, expect, it } from "vitest";

import { NEO_DARK_EDITOR_COLORS } from "./customThemes";
import { CUSTOM_PALETTES, THEMES, themeTokens } from "./themeFixtures";
import { contrastRatio, deriveThemeTokens } from "./themeDerivation";
import { declarations, parseRules, stripComments } from "../test/cssRules";

/**
 * The selected look (C4) and the control edge (C11): a row's text stays readable on the
 * selected fill, its accent bar and a control's border stand out at 3:1, and the active
 * tab's underline too. Computed from the themes' own values, not a browser.
 */
/** `color-mix(in srgb, <top> <percent>%, <base>)` in sRGB. */
function mix(top: string, base: string, percent: number): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(1 + at * 2, 3 + at * 2), 16);
  const out = [0, 1, 2].map((at) =>
    Math.round((channel(top, at) * percent + channel(base, at) * (100 - percent)) / 100)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${out.join("")}`;
}

const TOKENS_CSS = (await import("./tokens.css?raw")).default;
const SELECTED_MIX = Number(/--bg-selected:\s*color-mix\(in srgb,\s*var\(--accent-primary\)\s*(\d+)%/.exec(TOKENS_CSS)?.[1]);

const CASES: [string, Record<string, string>][] = [
  ...Object.entries(THEMES).map(([name, css]) => [name, themeTokens(css)] as [string, Record<string, string>]),
  ["custom (derived)", deriveThemeTokens(NEO_DARK_EDITOR_COLORS)],
];

describe("the selected-row token", () => {
  it("is the accent mixed into the input background", () => {
    expect(SELECTED_MIX).toBeGreaterThan(0);
    expect(TOKENS_CSS).toMatch(/--bg-selected:\s*color-mix\(in srgb,\s*var\(--accent-primary\)\s*\d+%,\s*var\(--bg-input\)\)/);
  });
});

describe.each(CASES)("selection and control edges in %s", (_name, t) => {
  const selected = mix(t["accent-primary"]!, t["bg-input"]!, SELECTED_MIX);

  it("reads --fg-primary at 4.5:1 on the selected fill", () => {
    expect(contrastRatio(t["fg-primary"]!, selected)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --fg-muted at 3:1 on the selected fill", () => {
    expect(contrastRatio(t["fg-muted"]!, selected)).toBeGreaterThanOrEqual(3);
  });

  it("draws the accent bar at 3:1 against the selected fill", () => {
    expect(contrastRatio(t["accent-primary"]!, selected)).toBeGreaterThanOrEqual(3);
  });

  it("draws a control's border at 3:1 against the toolbar and the panel", () => {
    expect(contrastRatio(t["border-control"]!, t["bg-toolbar"]!), "toolbar").toBeGreaterThanOrEqual(3);
    expect(contrastRatio(t["border-control"]!, t["bg-panel"]!), "panel").toBeGreaterThanOrEqual(3);
  });

  it("draws the active tab's underline at 3:1 against the toolbar", () => {
    expect(t["tab-underline-color"], "every theme sets its own underline colour").toBeTruthy();
    expect(contrastRatio(t["tab-underline-color"]!, t["bg-toolbar"]!)).toBeGreaterThanOrEqual(3);
  });
});

describe.each(CUSTOM_PALETTES)("the control border in %s", (_name, colors) => {
  it("stands at 3:1 against both the toolbar and the panel", () => {
    const t = deriveThemeTokens(colors);
    expect(contrastRatio(t["border-control"]!, t["bg-toolbar"]!), "toolbar").toBeGreaterThanOrEqual(3);
    expect(contrastRatio(t["border-control"]!, t["bg-panel"]!), "panel").toBeGreaterThanOrEqual(3);
  });

  it("derives its own tab underline at 3:1 against the toolbar", () => {
    const t = deriveThemeTokens(colors);
    expect(contrastRatio(t["tab-underline-color"]!, t["bg-toolbar"]!)).toBeGreaterThanOrEqual(3);
  });
});

describe("selection is not drawn as an inset ring", () => {
  const STYLESHEETS = import.meta.glob<string>("../**/*.css", { query: "?raw", import: "default", eager: true });

  it("no stylesheet sets a selection box-shadow: inset 0 0 0", () => {
    const offenders: string[] = [];
    for (const [file, css] of Object.entries(STYLESHEETS)) {
      for (const rule of parseRules(stripComments(css))) {
        if (!/select|--on|--active|aria-pressed|aria-selected/.test(rule.selector)) continue;
        for (const [name, value] of declarations(rule.body)) {
          if (name === "box-shadow" && /inset\s+0\s+0\s+0/.test(value)) offenders.push(`${file}: ${rule.selector}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
