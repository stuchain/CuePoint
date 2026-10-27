/**
 * The Library's pane starts at its own top. It shares one line with the table (the header's rule)
 * and only when it has room; the toolbar's rules are the right side's alone.
 */
import { describe, expect, it } from "vitest";
import library from "./library.css?raw";
import pane from "./CollectionsPane.css?raw";
import filterBar from "./FilterBar.css?raw";
import playlistPane from "./PlaylistPane.css?raw";
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

  it("puts the pane on the table's grid: All tracks a bar tall, heads a row tall, no gap between sections (Q2)", () => {
    // Was a floor under the Collections section (useSharedLines) that met only the header's line.
    expect(rule(pane, ".cp-library-pane__all .cp-playlist-pane__row")).toContain(
      "min-height: calc(var(--toolbar-height) - var(--hairline))",
    );
    expect(rule(filterBar, ".cp-filter-bar__row")).toContain("min-height: calc(var(--toolbar-height) - var(--hairline))");
    expect(rule(playlistPane, ".cp-playlist-pane__head")).toContain("min-block-size: var(--row-height)");
    expect(rule(pane, ".cp-collections")).toContain("border-bottom: 0");
    expect(strip(pane)).not.toContain("--library-collections-min");
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

  it("draws the Yours stars amber when filled, grey when empty, a token apart (C104, P13)", () => {
    expect(rule(detail, ".cp-track-yours__star")).toContain("color: var(--fg-muted)");
    expect(rule(detail, ".cp-track-yours__star--on")).toContain("color: var(--warning-text)"); // P13: amber (was the primary text)
    expect(rule(detail, ".cp-track-yours__stars")).toContain("gap: var(--space-2xs)");
    expect(rule(detail, ".cp-track-yours__group")).toContain("gap: var(--space-2xs)");
  });

  it("stacks every Yours label above its field, 4 apart, as Add a tag is (new K)", () => {
    for (const selector of [".cp-track-yours__rating", ".cp-track-yours__row"]) {
      const body = rule(detail, selector);
      expect(body).toMatch(/display:\s*flex/);
      expect(body).toMatch(/flex-direction:\s*column/);
      expect(body).toMatch(/gap:\s*var\(--space-xs\)/);
      expect(body).not.toMatch(/grid-template-columns/);
    }
  });

  it("draws Favorite as a quiet icon button, accent when on (P13; was D1's selected fill and accent border)", () => {
    const off = rule(detail, ".cp-track-yours__favorite");
    expect(off).toContain("background: transparent");
    expect(off).toMatch(/border:\s*var\(--control-border-width\) solid transparent/);
    const on = rule(detail, ".cp-track-yours__favorite--on");
    expect(on).toContain("color: var(--accent-primary)");
    expect(on).not.toContain("background");
  });

  it("ends the rating, the notes and the tags with a divider (P13)", () => {
    for (const selector of [".cp-track-yours__rating", ".cp-track-yours__row"]) {
      expect(rule(detail, selector)).toContain("border-bottom: var(--divider)");
    }
  });

  it("keeps no divider between the pane and the table: the main column has no left edge and the pane no right one (P1)", () => {
    // P1: the pane is the panel tone beside the sunken table, so the two tones meet without a line.
    expect(strip(library)).not.toMatch(/library-screen__main[^{]*\{[^}]*border-left/);
    expect(rule(pane, ".cp-library-pane")).toContain("border-right: 0");
  });

  it("keeps the pane's floor at 112px times the scale, capped at 45% of the body", () => {
    // A 200px floor (round 8) cost the table two rows with Track details open; names that do not
    // fit end in "…" (PaneTree), so the table keeps its width.
    const columns = rule(library, ".library-screen__body");
    expect(columns).toMatch(/clamp\(min\(calc\(112px \* var\(--scale\)\), 45%\)/);
  });
});

describe("the pane's headings in a narrow pane (zoom spot 1C)", () => {
  const head = ".cp-library-pane .cp-playlist-pane > .cp-playlist-pane__head";

  it("keep a heading on one line (W1, was 1C's wrap): a narrow pane shortens + New and hides from Rekordbox", async () => {
    expect(rule(pane, head)).toMatch(/flex-wrap:\s*nowrap/);
    for (const item of [".cp-library-pane .cp-collections__create", ".cp-library-pane .cp-playlist-pane__head > .cp-playlist-pane__source-hint"]) {
      expect(rule(pane, item)).toMatch(/margin-inline-start:\s*auto/);
    }
    const playlists = (await import("./PlaylistPane.css?raw")).default as string;
    // The query is in the pane's own text size, so it holds at every scale.
    const narrow = playlists.slice(playlists.indexOf("@container library-pane (max-width: 18em)"));
    expect(narrow).toMatch(/^@container library-pane \(max-width: 18em\)\s*\{[^{]*\.cp-library-pane \.cp-playlist-pane > \.cp-playlist-pane__head > \.cp-playlist-pane__source-hint\s*\{\s*display:\s*none/);
    expect(narrow).toMatch(/\.cp-collections__new-word\s*\{[^}]*clip-path:\s*inset\(50%\)/);
  });

  it("never ellipsize the title, and keep + New whole", () => {
    const title = rule(pane, ".cp-library-pane .cp-playlist-pane__title");
    expect(title).not.toMatch(/text-overflow/);
    expect(title).not.toMatch(/overflow:\s*hidden/);
    expect(title).toMatch(/white-space:\s*nowrap/);
    expect(rule(pane, ".cp-library-pane .cp-playlist-pane__head > .cp-playlist-pane__fold")).toMatch(/flex:\s*none/);
    expect(rule(pane, ".cp-library-pane .cp-collections__create")).toMatch(/flex:\s*none/);
  });
});
