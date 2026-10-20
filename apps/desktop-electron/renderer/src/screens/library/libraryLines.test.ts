/**
 * The Library's pane starts at its own top. It shares one line with the table (the header's rule)
 * and only when it has room; the toolbar's rules are the right side's alone.
 */
import { describe, expect, it } from "vitest";
import library from "./library.css?raw";
import pane from "./CollectionsPane.css?raw";
import filterBar from "./FilterBar.css?raw";
import detail from "./TrackDetailPanel.css?raw";

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

  it("draws each rule once: the table has no top or left border", () => {
    const table = rule(library, ".library-screen__table .track-table");
    expect(table).toContain("border-top: 0");
    expect(table).toContain("border-left: 0");
  });

  it("closes the All tracks row with a divider", () => {
    expect(rule(pane, ".cp-library-pane__all")).toContain("border-bottom: var(--divider)");
  });

  it("lays the filter row out as the shared toolbar, with no px of its own", () => {
    // The row is `.cp-toolbar` (C217): its height, padding and 8 between controls are the shared
    // class's. The selection bar above it is the shared SelectionBar.
    const row = rule(filterBar, ".cp-filter-bar__row");
    expect(row).not.toMatch(/\d+px/);
    // Sizes are tokens or scaled; the one raw 1px is the visually hidden label's.
    const raw = strip(filterBar)
      .replace(/calc\([\d.]+px \* var\(--scale\)\)/g, "")
      .replace(/(width|height|margin): -?1px/g, "");
    expect(raw).not.toMatch(/\d+px/);
    expect(rule(library, ".library-screen__body")).toMatch(/--library-module:\s*round\(nearest, calc\(12px/);
  });

  it("keeps the selection bar and the count in the filter row, where Select all is", () => {
    expect(rule(filterBar, ".cp-filter-bar__trailing")).toContain("margin-inline-start: auto");
  });

  it("lets the Inspector's body be the scroller for Track details, with the head on its colour", () => {
    // A second scroller inside the body would make the sticky head stick to the wrong box.
    expect(rule(detail, ".cp-track-detail")).not.toMatch(/overflow/);
    expect(rule(detail, ".cp-track-detail .cp-track-detail__head")).toContain("background: var(--bg-toolbar)");
  });

  it("draws the Yours stars like the table's: white filled, grey empty, a token apart (C104)", () => {
    expect(rule(detail, ".cp-track-yours__star")).toContain("color: var(--fg-muted)");
    expect(rule(detail, ".cp-track-yours__star--on")).toContain("color: var(--fg-primary)");
    expect(rule(detail, ".cp-track-yours__stars")).toContain("gap: var(--space-2xs)");
    expect(rule(detail, ".cp-track-yours__group")).toContain("gap: var(--space-2xs)");
  });

  it("draws Favorite on as D1 says: selected fill, accent border, primary text", () => {
    const on = rule(detail, ".cp-track-yours__favorite--on");
    expect(on).toContain("background: var(--bg-selected)");
    expect(on).toContain("border-color: var(--accent-primary)");
    expect(on).toContain("color: var(--fg-primary)");
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

describe("the pane's headings in a narrow pane (item 2, at 2x)", () => {
  it("keep + New whole and let the title and from Rekordbox end in an ellipsis", () => {
    expect(rule(pane, ".cp-library-pane .cp-playlist-pane__head > .cp-playlist-pane__fold")).toMatch(/min-width:\s*0/);
    const title = rule(pane, ".cp-library-pane .cp-playlist-pane__title");
    expect(title).toMatch(/text-overflow:\s*ellipsis/);
    expect(title).toMatch(/overflow:\s*hidden/);
    expect(rule(pane, ".cp-library-pane .cp-playlist-pane__head > .cp-hint")).toMatch(/min-width:\s*0/);
    expect(rule(pane, ".cp-library-pane .cp-collections__create")).toMatch(/flex:\s*none/);
  });
});
