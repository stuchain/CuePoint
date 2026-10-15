import { describe, expect, it } from "vitest";
import { declarations, parseRules, selectorList, stripComments } from "../../test/cssRules";

import playerBar from "./PlayerBar.css?raw";
import tokensCss from "../../tokens/tokens.css?raw";
import badgeCss from "../Badge.css?raw";

/**
 * C16c: the player bar looks exactly as it did before the quieter-chrome sweep. This does not
 * pin PlayerBar.css's whole text (layout still changes); it pins what the sweep must not move.
 */
const STYLESHEETS = import.meta.glob<string>("/src/**/*.css", { query: "?raw", import: "default", eager: true });

function ruleDecls(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of parseRules(stripComments(css))) {
    if (selectorList(rule.selector).includes(selector)) {
      for (const [name, value] of declarations(rule.body)) out[name] = value;
    }
  }
  return out;
}

describe("the player bar keeps its look", () => {
  it("draws its buttons with the heavy border, the hit target and the panel fill", () => {
    const button = ruleDecls(playerBar, ".cp-player-bar__button");
    expect(button["border"]).toBe("var(--border-width) solid var(--border-outline)");
    expect(button["min-width"]).toBe("var(--hit-min)");
    expect(button["min-height"]).toBe("var(--hit-min)");
    expect(button["background"]).toBe("var(--bg-panel)");
  });

  it("lets the artist and label shrink while the key chip, BPM and year keep their room", () => {
    expect(ruleDecls(playerBar, ".cp-player-bar__meta")["display"]).toBe("flex");
    const lead = ruleDecls(playerBar, ".cp-player-bar__meta-lead");
    expect(lead["min-width"]).toBe("0");
    expect(lead["text-overflow"]).toBe("ellipsis");
    expect(ruleDecls(playerBar, ".cp-player-bar__meta-fixed")["flex"]).toBe("none");
  });

  it("keeps the structural tokens and the player badge shadow", () => {
    const tokens = stripComments(tokensCss);
    expect(tokens).toMatch(/--border-width:\s*round\(down, calc\(2px \* var\(--scale\)\), 1px\);/);
    expect(tokens).toMatch(/--hit-min:\s*calc\(44px \* var\(--scale\)\);/);
    expect(tokens).toMatch(/--shadow-badge:/);
    expect(ruleDecls(badgeCss, ".cp-badge--player")["box-shadow"]).toBe("var(--shadow-badge)");
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
