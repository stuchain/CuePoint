/**
 * P15 and P24: the Library figures are four cards in the data face at 26, the Health bars are thin
 * over the alt slab, and a Health swatch is a status dot. Read from the sheet (jsdom draws no layout).
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
    expect(value).toMatch(/font-size:\s*var\(--font-size-figure\)/);
    expect(value).toMatch(/font-variant-numeric:\s*tabular-nums/);
    // 26 at 1.5x is 39, whole, so it needs no round().
    expect(tokens).toMatch(/--font-size-figure:\s*calc\(26px \* var\(--scale\)\)/);
  });
});

describe("Health (P24)", () => {
  it("draws the bar 4 tall over the alt slab, and the neutral part as a colour mix, not opacity", () => {
    expect(body(".stacked__bar")).toMatch(/height:\s*var\(--space-xs\)/);
    expect(body(".stacked__bar")).toMatch(/background:\s*var\(--bg-panel-alt\)/);
    expect(body(".stacked__part--neutral")).toMatch(/color-mix\(in srgb, var\(--fg-muted\) 45%, transparent\)/);
    expect(css).not.toMatch(/opacity/);
  });

  it("draws a row's swatch as a status dot, and leaves the legend's swatch square", () => {
    const dot = body(".health-card__swatch");
    expect(dot).toMatch(/width:\s*var\(--status-dot\)/);
    expect(dot).toMatch(/border-radius:\s*50%/);
    expect(body(".stacked__swatch")).not.toMatch(/border-radius/);
  });

  it("sets labels and counts in Inter with tabular figures", () => {
    for (const selector of [".health-card__label", ".health-card__count"]) {
      expect(body(selector)).toMatch(/font-family:\s*var\(--font-data\)/);
      expect(body(selector)).toMatch(/font-variant-numeric:\s*tabular-nums/);
    }
  });
});
