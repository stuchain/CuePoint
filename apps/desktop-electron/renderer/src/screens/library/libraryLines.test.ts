/**
 * The Library's pane starts at its own top. It shares one line with the table (the header's rule)
 * and only when it has room; the toolbar's rules are the right side's alone.
 */
import { describe, expect, it } from "vitest";
import library from "./library.css?raw";
import toolbar from "./LibraryToolbar.css?raw";
import pane from "./CollectionsPane.css?raw";
import filterBar from "./FilterBar.css?raw";

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function rule(css: string, selector: string): string {
  const at = strip(css).indexOf(`${selector} {`);
  expect(at, `${selector} exists`).toBeGreaterThanOrEqual(0);
  const text = strip(css).slice(at);
  return text.slice(0, text.indexOf("}"));
}

describe("the Library's shared lines", () => {
  it("defines no band: the pane's rows are not sized by the right side's lines", () => {
    // Regression (round 8): --library-line-1/2 made "All tracks" and the Collections heading as tall
    // as the toolbar above the table, a blank band of up to 170px.
    expect(strip(library)).not.toContain("--library-line-");
    expect(strip(pane)).not.toContain("--library-line-");
    expect(rule(pane, ".cp-library-pane__all")).not.toMatch(/height:/);
    expect(rule(pane, ".cp-library-pane .cp-playlist-pane > .cp-playlist-pane__head")).not.toMatch(/\bheight:/);
  });

  it("shares only the table header's line, as a floor under the Collections section", () => {
    expect(rule(pane, ".cp-library-pane .cp-collections")).toContain(
      "min-height: var(--library-collections-min, 0)",
    );
  });

  it("draws each rule once: the toolbar's is its bottom, and the table has no top or left border", () => {
    expect(strip(toolbar)).toContain("border-bottom: var(--hairline) solid var(--border-muted)");
    const table = rule(library, ".library-screen__table .track-table");
    expect(table).toContain("border-top: 0");
    expect(table).toContain("border-left: 0");
  });

  it("closes the All tracks row with a divider", () => {
    expect(rule(pane, ".cp-library-pane__all")).toContain("border-bottom: var(--divider)");
  });

  it("lays both bars out as one toolbar, 8 between controls and one module between the bars", () => {
    const bar = rule(toolbar, ".library-toolbar");
    expect(bar).toContain("min-height: var(--toolbar-height)");
    expect(bar).toContain("padding: var(--toolbar-padding)");
    expect(bar).toContain("margin-top: var(--library-module)");
    expect(bar).toMatch(/--library-toolbar-row-gap:\s*round\(nearest, calc\(8px \* var\(--scale\)\), 1px\)/);
    const filter = rule(filterBar, ".cp-filter-bar");
    expect(filter).toContain("min-height: var(--toolbar-height)");
    expect(filter).toContain("padding: var(--toolbar-padding)");
    expect(rule(library, ".library-screen__body")).toMatch(/--library-module:\s*round\(nearest, calc\(12px/);
  });

  it("keeps one divider: only the pane has a right edge, the main column has no left one", () => {
    expect(strip(library)).not.toMatch(/library-screen__main[^{]*\{[^}]*border-left/);
    expect(rule(pane, ".cp-library-pane")).toContain("border-right: var(--divider)");
  });

  it("keeps the pane's floor at 112px times the scale, capped at 45% of the body", () => {
    // A 200px floor (round 8) cost the table two rows with Track details open; names that do not
    // fit end in "…" (PaneTree), so the table keeps its width.
    const columns = rule(library, ".library-screen__body");
    expect(columns).toMatch(/clamp\(min\(calc\(112px \* var\(--scale\)\), 45%\)/);
  });
});
