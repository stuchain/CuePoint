/**
 * P15, P24 and D22: the Overview figures are four cards in the data face at the large size, the
 * Health bars are thin over the alt slab, and a Health status is a square pixel mark, not a round
 * swatch (M34, M208). Read from the sheet (jsdom draws no layout).
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../../test/cssRules";
import tokens from "../../tokens/tokens.css?raw";
import css from "./statistics.css?raw";

const rules = parseRules(stripComments(css));
const body = (selector: string) =>
  rules.find((rule) => rule.selector.split(",").map((part) => part.trim()).includes(selector))?.body ?? "";

describe("Library figures (P15)", () => {
  it("has no frame; each cell is a panel-tone card with no line beside it", () => {
    expect(body(".library-figures")).toMatch(/border:\s*0/);
    expect(body(".library-figures__cell")).toMatch(/background:\s*var\(--bg-panel\)/);
    expect(body(".library-figures__cell")).not.toMatch(/border/);
    expect(css).not.toContain(".library-figures__cell:first-child");
  });

  it("sets the value in Inter semibold, tabular, at the figure size", () => {
    const value = body(".library-figures__value");
    expect(value).toMatch(/font-family:\s*var\(--font-data\)/);
    expect(value).toMatch(/font-weight:\s*var\(--font-weight-semibold\)/);
    // D22: the tile figures are at the large size (18), a step under the old 26, so they read as
    // the page's numbers and not as a second heading. The 26 token stays in the sheet of tokens.
    expect(value).toMatch(/font-size:\s*var\(--font-size-lg\)/);
    expect(value).toMatch(/font-variant-numeric:\s*tabular-nums/);
    // Round 3 (M2): every text size lands on a whole pixel at every scale, so it is rounded.
    expect(tokens).toMatch(/--font-size-figure:\s*round\(nearest, calc\(26px \* var\(--scale\)\), 1px\)/);
  });
});

describe("Health (P24)", () => {
  it("draws the bar 4 tall over the alt slab, and the neutral part as a colour mix, not opacity", () => {
    expect(body(".stacked__bar")).toMatch(/height:\s*var\(--space-xs\)/);
    expect(body(".stacked__bar")).toMatch(/background:\s*var\(--bg-panel-alt\)/);
    expect(body(".stacked__part--neutral")).toMatch(/color-mix\(in srgb, var\(--fg-muted\) 45%, transparent\)/);
    expect(css).not.toMatch(/opacity/);
  });

  it("has no round swatch: the one status dot is a pixel icon, and the legend's swatch is square (M34, M208)", () => {
    expect(css).not.toContain(".health-card__swatch");
    expect(css).not.toMatch(/border-radius:\s*50%/);
    expect(body(".health-card__dot")).toMatch(/color:\s*var\(--warning-text\)/);
    expect(body(".stacked__swatch")).not.toMatch(/border-radius/);
  });

  it("lays a row out as label, link, count so the counts end on the card's right edge (M210)", () => {
    expect(body(".health-card__row")).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) minmax\(max-content, 17ch\) 6ch/);
    expect(body(".health-card__bar-slot")).toMatch(/height:\s*var\(--space-xs\)/);
  });

  it("sets labels and counts in Inter with tabular figures", () => {
    for (const selector of [".health-card__label", ".health-card__count"]) {
      expect(body(selector)).toMatch(/font-family:\s*var\(--font-data\)/);
      expect(body(selector)).toMatch(/font-variant-numeric:\s*tabular-nums/);
    }
  });
});
