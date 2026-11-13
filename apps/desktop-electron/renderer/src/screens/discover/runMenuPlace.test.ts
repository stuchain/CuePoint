/**
 * B9: a dig card's ⋯ menu sits at the card's top right (discover.css, position: absolute). The shared
 * small icon button needs a positioned box for its hit square; that rule must not outrank the card's,
 * or the button drops into the flow under the card.
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../../test/cssRules";
import buttonCss from "../../components/Button.css?raw";
import discoverCss from "./discover.css?raw";

const CLASSES = ["cp-btn", "cp-btn--icon", "cp-btn--sm", "cp-btn--ghost", "discover-runs__menu"];

/** Classes counted for specificity; a selector's :where(...) counts nothing. */
function weight(selector: string): number {
  return (selector.replace(/:where\([^)]*\)/g, "").match(/\.[\w-]+/g) ?? []).length;
}

/** A compound selector of classes only (inside or outside :where) that the menu button matches. */
function matches(selector: string): boolean {
  if (/[\s>+~]|::|:(?!where)/.test(selector.replace(/:where\(([^)]*)\)/g, "$1").trim())) return false;
  const classes = selector.replace(/:where\(([^)]*)\)/g, "$1").match(/\.[\w-]+/g) ?? [];
  return classes.length > 0 && classes.every((name) => CLASSES.includes(name.slice(1)));
}

describe("the dig card's ⋯ menu (B9)", () => {
  it("keeps the card's absolute place over the shared button's relative one", () => {
    const sheets = [buttonCss, discoverCss]; // Button.css is imported first, so discover.css wins a tie.
    let winner: { value: string; weight: number; order: number } | null = null;
    let order = 0;
    for (const sheet of sheets) {
      for (const rule of parseRules(stripComments(sheet))) {
        const value = /(?:^|;)\s*position:\s*([\w-]+)/.exec(rule.body)?.[1];
        for (const selector of rule.selector.split(",").map((s) => s.trim())) {
          order += 1;
          if (!value || !matches(selector)) continue;
          const candidate = { value, weight: weight(selector), order };
          if (!winner || candidate.weight >= winner.weight) winner = candidate;
        }
      }
    }
    expect(winner?.value).toBe("absolute");
  });
});
