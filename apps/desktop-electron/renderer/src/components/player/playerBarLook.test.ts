import { describe, expect, it } from "vitest";
import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";
import { THEMES, themeTokens } from "../../test/themeFixtures";
import { contrastRatio } from "../../tokens/themeDerivation";

import playerBar from "./PlayerBar.css?raw";
import tokensCss from "../../tokens/tokens.css?raw";

/**
 * C16c: the player bar looks exactly as it did before the quieter-chrome sweep. This does not
 * pin PlayerBar.css's whole text (layout still changes); it pins what the sweep must not move.
 */
const STYLESHEETS = import.meta.glob<string>("/src/**/*.css", { query: "?raw", import: "default", eager: true });

function ruleDecls(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of parseRules(stripComments(css))) {
    // The compact-window rules (a media query) restyle these on purpose; the look is the plain one.
    if (rule.context === "" && selectorList(rule.selector).includes(selector)) {
      for (const [name, value] of declarations(rule.body)) out[name] = value;
    }
  }
  return out;
}

describe("the player bar keeps its look", () => {
  // D27, M304: the transport is ~36 px (it was the 44 px hit target), the same square for all three.
  it("draws its transport buttons with a hairline control border, the 36 px transport size and the panel fill (P4)", () => {
    const button = ruleDecls(playerBar, ".cp-player-bar__button");
    expect(button["border"]).toBe("var(--hairline) solid var(--border-control)");
    expect(button["min-width"]).toBe("var(--player-transport)");
    expect(button["min-height"]).toBe("var(--player-transport)");
    expect(ruleDecls(playerBar, ".cp-player-bar")["--player-transport"]).toBe("round(nearest, calc(36px * var(--scale)), 1px)");
    expect(button["background"]).toBe("var(--bg-panel)");
  });

  // M75, M30 (D3): the right cluster is one square, the control height but never under the lg icon.
  it("draws the other five buttons as one square the lg icon fits, and quiet (P22)", () => {
    const standard = ruleDecls(playerBar, ".cp-player-bar__button--standard");
    expect(standard["background"]).toBe("transparent");
    expect(standard["border-color"]).toBe("transparent");
    expect(standard["color"]).toBe("var(--fg-muted)");
    expect(standard["min-width"]).toBe("var(--player-cluster)");
    expect(standard["min-height"]).toBe("var(--player-cluster)");
    expect(ruleDecls(playerBar, ".cp-player-bar")["--player-cluster"]).toBe("max(var(--control-height), var(--icon-size-lg))");
    expect(standard["padding"]).toBe("0");
  });

  it("is one compact line in a short window, which the page flag says (C207)", () => {
    const rules = parseRules(stripComments(playerBar));
    const compact = (selector: string) =>
      rules.find((rule) => rule.selector === `:root[data-short-window] ${selector}`);
    expect(compact(".cp-player-bar")?.body).toMatch(/flex-wrap:\s*nowrap/);
    expect(compact(".cp-player-bar__meta")).toBeDefined();
    expect(rules.some((rule) => rule.context.includes("max-height"))).toBe(false);
  });

  it("insets the bar the same on both sides, as the status strip and the panels do (C46)", () => {
    const bar = ruleDecls(playerBar, ".cp-player-bar");
    expect(bar["padding"]).toBe("var(--space-sm) var(--space-lg)");
  });

  it("fills a hovered button with the shared hover fill (R3-14)", () => {
    const hover = parseRules(stripComments(playerBar)).find(
      (rule) => rule.selector === ".cp-player-bar__button:hover:not(:disabled)",
    );
    expect(Object.fromEntries(declarations(hover!.body))["background"]).toBe("var(--hover-fill)");
  });

  it("greys the transport when nothing is loaded, Play grey like the rest (M302, M326)", () => {
    const off = ruleDecls(playerBar, ".cp-player-bar__button:disabled");
    expect(off["color"]).toBe("var(--fg-disabled)");
    expect(off["border-color"]).toBe("var(--border-disabled)");
    expect(off["background"]).toBe("transparent");
    expect(off["cursor"]).toBe("default");
    // No violet is left on a disabled Play: it takes the transport's own disabled rule.
    expect(ruleDecls(playerBar, ".cp-player-bar__button--play:disabled")).toEqual({});
  });

  // D27, M303: Play is framed grey with a violet icon; the violet fill is for while it plays only.
  it("frames Play grey with a violet icon, fills it with the accent only while it plays (D27, M303)", () => {
    const play = ruleDecls(playerBar, ".cp-player-bar__button--play");
    expect(play["background"]).toBeUndefined();
    expect(play["border-color"]).toBeUndefined();
    expect(play["color"]).toBe("var(--accent-primary)");
    const playing = ruleDecls(playerBar, '.cp-player-bar__button--play[aria-pressed="true"]');
    expect(playing["background"]).toBe("var(--accent-fill)");
    expect(playing["color"]).toBe("var(--fg-on-accent)");
    expect(playing["border-color"]).toBe("var(--accent-fill)");
  });

  // D30, M340: an engaged toggle is the selected tint, the accent icon and the 1px accent line.
  it("turns a toggle on with the selected tint, the accent icon and the accent line (P22, M340)", () => {
    const on = ruleDecls(playerBar, ".cp-player-bar__button--on");
    expect(on["background"]).toBe("var(--bg-selected)");
    expect(on["color"]).toBe("var(--accent-primary)");
    expect(on["border-color"]).toBe("var(--accent-primary)");
    expect(on["border"]).toBeUndefined();
    expect(on["box-shadow"]).toBeUndefined();
  });

  it("keeps a line in a system colour for the playing Play and an engaged toggle in forced colours (M303, M340)", () => {
    const forced = parseRules(stripComments(playerBar)).filter((rule) => rule.context.includes("forced-colors"));
    const body = (selector: string) => forced.find((rule) => selectorList(rule.selector).includes(selector))?.body ?? "";
    expect(body('.cp-player-bar__button--play[aria-pressed="true"]')).toMatch(/Highlight/);
    expect(body(".cp-player-bar__button--on")).toMatch(/border-color:\s*Highlight/);
  });

  it("has no pixel breakpoint: the width rules are the bar's own fold, in the text size's units", () => {
    expect(stripComments(playerBar)).not.toMatch(/\(max-width:\s*\d+px\)/);
  });

  it("nudges the Play triangle to the middle of its cell (M307)", () => {
    expect(ruleDecls(playerBar, ".cp-player-bar__play-icon--play")["translate"]).toMatch(/^round\(nearest, calc\(2px \* var\(--scale\)\), 1px\) 0$/);
  });

  it("draws the player's key chip as the tables' chip: its own size, line height 1 (M308)", () => {
    const chip = ruleDecls(playerBar, ".cp-player-bar__meta .key-chip");
    expect(chip["font-size"]).toBe("var(--font-size-chip)");
    expect(chip["line-height"]).toBe("1");
  });

  // M314: the count is the text colour at full strength (the accent icon's 3.65:1 was too faint), the line's own height.
  it("draws the queue count as semibold text in the primary colour, with no fill (P22, M314)", () => {
    const count = ruleDecls(playerBar, ".cp-player-bar__count");
    expect(count["font-weight"]).toBe("var(--font-weight-semibold)");
    expect(count["color"]).toBe("var(--fg-primary)");
    expect(count["line-height"]).toBe("normal");
    expect(count["background"]).toBeUndefined();
    expect(count["--chip-text"]).toBeUndefined();
    expect(count["border"]).toBeUndefined();
    expect(count["box-shadow"]).toBeUndefined();
  });

  it("puts the bar on the toolbar tone under a hairline in the divider colour (P4)", () => {
    const bar = ruleDecls(playerBar, ".cp-player-bar");
    expect(bar["background"]).toBe("var(--bg-toolbar)");
    expect(bar["border-top"]).toBe("var(--hairline) solid var(--divider-color)");
  });

  it("holds the badge pair at 4.5:1 in every theme", () => {
    for (const [name, css] of Object.entries(THEMES)) {
      const theme = themeTokens(css);
      expect(contrastRatio(theme["fg-on-accent"]!, theme["accent-fill"]!), `${name} badge`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("lets the artist and label shrink while the key chip, BPM and year keep their room", () => {
    expect(ruleDecls(playerBar, ".cp-player-bar__meta")["display"]).toBe("flex");
    const lead = ruleDecls(playerBar, ".cp-player-bar__meta-lead");
    expect(lead["min-width"]).toBe("0");
    expect(lead["text-overflow"]).toBe("ellipsis");
    expect(ruleDecls(playerBar, ".cp-player-bar__meta-fixed")["flex"]).toBe("none");
  });

  // --shadow-badge stays defined: the website's synced tokens use it (Badge.astro, Button.astro); only the
  // player badge that used it in the app is gone (P22).
  it("keeps the structural tokens", () => {
    const tokens = stripComments(tokensCss);
    expect(tokens).toMatch(/--border-width:\s*round\(down, calc\(2px \* var\(--scale\)\), 1px\);/);
    expect(tokens).toMatch(/--hit-min:\s*calc\(44px \* var\(--scale\)\);/);
    expect(tokens).toMatch(/--shadow-badge:/);
  });

  it("is styled only from components/player/", () => {
    const offenders: string[] = [];
    for (const [file, css] of Object.entries(STYLESHEETS)) {
      if (file.includes("/components/player/")) continue;
      for (const rule of parseRules(stripComments(css))) {
        if (rule.selector.includes("cp-player-bar")) offenders.push(`${file}: ${rule.selector}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no bare button, select or input rule that sets a look", () => {
    const LOOK = /^(border|box-shadow|background|min-height|padding|font|font-family|font-size|font-weight)(-(top|right|bottom|left|color|width|style|radius|image|color))?$/;
    const offenders: string[] = [];
    for (const [file, css] of Object.entries(STYLESHEETS)) {
      for (const rule of parseRules(stripComments(css))) {
        if (!selectorList(rule.selector).some(endsInBareControl)) continue;
        for (const [name, value] of declarations(rule.body)) {
          if (!LOOK.test(name)) continue;
          if (isAllowed(file, rule.selector, name, value)) continue;
          offenders.push(`${file}: ${rule.selector} { ${name} }`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("recognises a bare control selector however it is written", () => {
    for (const bare of ["button", "button:hover", "body button", ":root select", "form > input:focus", "a + button[disabled]"]) {
      expect(endsInBareControl(bare), bare).toBe(true);
    }
    for (const classed of [".cp-btn", "button.cp-btn", "select.x:hover", ".x button.y", ".x button", "button .label", "div"]) {
      expect(endsInBareControl(classed), classed).toBe(false);
    }
  });
});

/** The last compound of a selector: what follows the final combinator outside () and []. */
function lastCompound(selector: string): string {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]!;
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(c)) start = i + 1;
  }
  return selector.slice(start);
}

/**
 * True when the last compound is a button, select or input type selector and no class appears
 * anywhere in the selector: such a rule reaches every control, the player bar's included. A
 * descendant of a class (`.cp-filter-bar__chip button`) is scoped to that component, so it is not.
 */
function endsInBareControl(selector: string): boolean {
  const trimmed = selector.trim();
  const compound = lastCompound(trimmed);
  return /^(button|select|input)(?![\w-])/.test(compound) && !trimmed.includes(".");
}

/**
 * The one bare rule that is allowed, by exact selector and declaration: index.css makes form
 * controls inherit the page font instead of the browser's, and sets no look.
 */
function isAllowed(file: string, selector: string, name: string, value: string): boolean {
  return (
    file.endsWith("/src/index.css") &&
    selectorList(selector).join(",") === "button,input,select" &&
    name === "font" &&
    value === "inherit"
  );
}

// P46, M305, M34: the seek and volume sliders are drawn: a 2px control-line track with the level in the accent
// and a 10px square thumb, in a box a control tall. The native input still owns the keys, the drag and the
// value, and the picture over a waveform is untouched.
describe("the sliders are drawn (P46)", () => {
  const css = stripComments(playerBar);
  const body = (selector: string) =>
    parseRules(css)
      .filter((r) => selectorList(r.selector).includes(selector))
      .map((r) => r.body)
      .join("\n");

  it("strips the native look and sets the geometry once", () => {
    const slider = body(".cp-player-bar__slider");
    expect(slider).toMatch(/appearance:\s*none/);
    expect(slider).toMatch(/background:\s*transparent/);
    expect(slider).toMatch(/--slider-track:\s*round\(nearest,\s*calc\(2px \* var\(--scale\)\),\s*1px\)/);
    expect(slider).toMatch(/--slider-thumb:\s*round\(nearest,\s*calc\(10px \* var\(--scale\)\),\s*1px\)/);
    expect(css).not.toMatch(/accent-color/);
  });

  it("takes presses over a control's height, not the 2px strip (M305)", () => {
    expect(body(".cp-player-bar__slider")).toMatch(/block-size:\s*var\(--control-height\)/);
  });

  it("draws the track in the control line, the level in the accent, and the thumb square, centred on the track", () => {
    const track = body(".cp-player-bar__slider::-webkit-slider-runnable-track");
    expect(track).toMatch(/var\(--accent-primary\) var\(--level\)/);
    expect(track).toMatch(/var\(--border-control\) var\(--level\)/);
    expect(track).not.toMatch(/--border-muted/);
    const thumb = body(".cp-player-bar__slider::-webkit-slider-thumb");
    expect(thumb).toMatch(/border-radius:\s*0/);
    expect(thumb).not.toMatch(/50%/);
    expect(thumb).toMatch(/background:\s*var\(--accent-primary\)/);
    expect(thumb).toMatch(/margin-top:\s*round\(nearest,\s*calc\(\(var\(--slider-track\) - var\(--slider-thumb\)\) \/ 2\),\s*1px\)/);
  });

  it("makes the volume thumb muted and a disabled thumb --fg-disabled", () => {
    expect(body(".cp-player-bar__slider--volume::-webkit-slider-thumb")).toMatch(/background:\s*var\(--fg-muted\)/);
    expect(body(".cp-player-bar__slider:disabled::-webkit-slider-thumb")).toMatch(/background:\s*var\(--fg-disabled\)/);
  });

  it("leaves the drawn-waveform rules alone: the input stays transparent over the picture", () => {
    expect(body(".cp-player-bar__wave--drawn .cp-player-bar__slider")).toMatch(/opacity:\s*0/);
    expect(body(".cp-player-bar__wave--drawn .cp-player-bar__slider::-webkit-slider-runnable-track")).toMatch(/background:\s*transparent/);
  });
});
