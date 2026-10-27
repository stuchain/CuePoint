/**
 * The selected look's accent bar is drawn once, at the row's left edge (C4).
 *
 * `--selected-row-background` is a gradient with the bar built in. Put on every cell of a
 * table row, or on every child of a grid row, it repeats the bar at each column's edge. In
 * a row made of cells the gradient belongs to the first cell only, and the other cells take
 * the flat `--bg-selected`.
 */
import { describe, expect, it } from "vitest";

import { declarations, parseRules, selectorList, stripComments } from "../test/cssRules";

const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

/**
 * How many rules used the token when this guard was written (rows, options, chips, nav links, ...).
 * Fewer found now means the scan has stopped seeing the stylesheets, and "none draws it per cell"
 * would be true of nothing.
 */
const RULES_KNOWN_TO_USE_THE_TOKEN = 10;

/** The last compound of a selector: what the rule actually paints. */
function subject(selector: string): string {
  const parts = selector.trim().split(/\s*[>+~]\s*|\s+/);
  return parts[parts.length - 1] ?? "";
}

/**
 * Whether the rule paints a part of a row rather than the row: a table cell, a cell-named class,
 * or a bare child of a row (`.row > div`, `.row > *`), which is how a grid row's columns are drawn.
 */
function paintsAPartOfARow(selector: string): boolean {
  const last = subject(selector);
  if (/^(td|th)\b/i.test(last) || /cell/.test(last) || last === "*") return true;
  const child = /\s*>\s*([a-z][\w-]*|\*)(?::[\w-]+(?:\([^)]*\))?)*$/i.exec(selector.trim());
  return child !== null && /^(div|span|li|\*)$/i.test(child[1]!);
}

describe("the selected-row bar", () => {
  const painters = Object.entries(sheets).flatMap(([file, css]) =>
    parseRules(stripComments(css)).flatMap((rule) =>
      declarations(rule.body)
        .filter(
          ([name, value]) =>
            (name === "background" || name === "background-image") && value.includes("--selected-row-background"),
        )
        .flatMap(() => selectorList(rule.selector).map((selector) => ({ file, selector }))),
    ),
  );

  it("finds the rules that draw it", () => {
    expect(painters.length).toBeGreaterThanOrEqual(RULES_KNOWN_TO_USE_THE_TOKEN);
  });

  it("is never drawn by every cell of a row, which put a bar at each column edge", () => {
    // The subject compound itself must say :first-child: a `:first-child` further up the selector
    // (`tr:first-child td`) selects the row, not the one cell. `:first-of-type` counts too: a row's
    // grip span comes before its cells, so the pinned cell is the first cell, not the first child (M202).
    const everyCell = painters.filter(
      ({ selector }) => paintsAPartOfARow(selector) && !/:first-(child|of-type)/.test(subject(selector)),
    );
    expect(everyCell.map(({ file, selector }) => `${file}: ${selector}`)).toEqual([]);
  });

  it("catches a rule that would draw it on every column of a grid row", () => {
    expect(paintsAPartOfARow(".grid-row > div")).toBe(true);
    expect(paintsAPartOfARow(".grid-row > *")).toBe(true);
    expect(paintsAPartOfARow(".table tr[data-open] td")).toBe(true);
    expect(paintsAPartOfARow(".table tr[data-open] td:first-child")).toBe(true);
    expect(paintsAPartOfARow(".list__row--selected")).toBe(false);
  });

  it("is drawn by the first cell of a selected Past searches row, the rest taking the flat fill", () => {
    const css = stripComments(sheets["/src/screens/clean/match/match.css"]!);
    const rules = parseRules(css);
    const first = rules.find((rule) => rule.selector.includes('tr[data-open="true"] td:first-child'));
    const rest = rules.find((rule) => /tr\[data-open="true"\] td$/.test(rule.selector));
    expect(first?.body).toContain("var(--selected-row-background)");
    expect(rest?.body).toContain("var(--bg-selected)");
    expect(rest?.body).not.toContain("--selected-row-background");
  });
});
