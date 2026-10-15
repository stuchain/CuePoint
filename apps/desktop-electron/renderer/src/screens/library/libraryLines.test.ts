/**
 * The Library's pane and its table share three lines, so the dividers run straight across:
 * the search row and "All tracks", the Play / Organize bar and the Collections heading, the
 * table header and the "+ New" row. They share tokens, and every part is a whole pixel.
 */
import { describe, expect, it } from "vitest";
import library from "./library.css?raw";
import toolbar from "./LibraryToolbar.css?raw";
import pane from "./CollectionsPane.css?raw";

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function rule(css: string, selector: string): string {
  const at = strip(css).indexOf(`${selector} {`);
  expect(at, `${selector} exists`).toBeGreaterThanOrEqual(0);
  const text = strip(css).slice(at);
  return text.slice(0, text.indexOf("}"));
}

describe("the Library's shared lines", () => {
  it("defines the three lines once, from shared tokens and no hand-scaled pixels", () => {
    const body = rule(library, ".library-screen__body");
    for (const name of ["--library-line-1", "--library-line-2", "--library-line-3"]) {
      expect(body).toContain(`${name}:`);
    }
    expect(body).toMatch(/--library-line-3:\s*calc\(var\(--row-height\) \+ var\(--hairline\)\)/);
    const tokens = body.split("--library-line-").slice(1);
    expect(tokens.join("")).not.toMatch(/\d+px\s*\*/);
  });

  it("draws each rule once: the toolbar's is its bottom, and the table has no top or left border", () => {
    expect(strip(toolbar)).toContain("border-bottom: var(--hairline) solid var(--border-muted)");
    const table = rule(library, ".library-screen__table .track-table");
    expect(table).toContain("border-top: 0");
    expect(table).toContain("border-left: 0");
  });

  it("gives the pane's rows the same heights, each closed by a divider", () => {
    const all = rule(pane, ".cp-library-pane__all");
    expect(all).toContain("height: var(--library-line-1");
    expect(all).toContain("border-bottom: var(--divider)");
    expect(rule(pane, ".cp-library-pane .cp-collections > .cp-playlist-pane__head")).toContain(
      "height: var(--library-line-2",
    );
    const create = rule(pane, ".cp-library-pane .cp-collections__create");
    expect(create).toContain("height: var(--library-line-3");
    expect(create).toContain("border-bottom: var(--divider)");
  });

  it("keeps one divider: only the pane has a right edge, the main column has no left one", () => {
    expect(strip(library)).not.toMatch(/library-screen__main[^{]*\{[^}]*border-left/);
    expect(rule(pane, ".cp-library-pane")).toContain("border-right: var(--divider)");
  });
});
