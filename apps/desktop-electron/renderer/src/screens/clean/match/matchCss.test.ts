/**
 * P25: the Match step's foot bars (Playlists and Review) sit on the between-tone under a divider.
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../../../test/cssRules";
import matchCss from "./match.css?raw";
import playlistsCss from "./playlists.css?raw";

const bodyOf = (css: string, selector: string) =>
  parseRules(stripComments(css)).find((rule) => rule.selector === selector)?.body ?? "";

describe("the Match step's foot bars (P25)", () => {
  it("puts the Review bar on the between-tone with a divider above it", () => {
    const bar = bodyOf(matchCss, ".review__footer");
    expect(bar).toMatch(/background:\s*var\(--bg-between\)/);
    expect(bar).toMatch(/border-top:\s*var\(--divider\)/);
  });

  it("has no Playlists bar any more: its action moved to the toolbar (D17)", () => {
    expect(bodyOf(playlistsCss, ".playlists__footer")).toBe("");
  });
});

describe("Past matches never raise a sideways scrollbar (M142)", () => {
  it("hides the table's sideways overflow, which is only a pixel or two", () => {
    expect(bodyOf(matchCss, ".match-past__scroll")).toMatch(/overflow-x:\s*hidden/);
  });
});

describe("Clean's tables take the shared look (M139, M140, M141)", () => {
  it("draws the tick column with the cell's padding and the global box, in both steps", () => {
    for (const css of [matchCss, playlistsCss]) {
      expect(css).toMatch(/padding-inline:\s*var\(--space-sm\)/);
    }
    expect(playlistsCss).not.toMatch(/width:\s*calc\(16px \* var\(--scale\)\)/);
    expect(matchCss).not.toMatch(/width:\s*calc\(16px \* var\(--scale\)\)/);
  });

  it("gives the mixed box the global look, with no rule of its own", () => {
    expect(matchCss).not.toMatch(/indeterminate/);
  });

  it("draws its rows' lines with the shared row line, not a muted border", () => {
    expect(matchCss).not.toMatch(/border-bottom:[^;]*border-muted/);
    expect(matchCss).not.toMatch(/\.review-candidates\s*\{[^}]*border:/);
  });

  it("opens the side panel over the table at a width in em, so text size moves it (M-breakpoint)", () => {
    expect(matchCss).toMatch(/@container review-body \(max-width: 45em\)/);
  });

  it("has one fill for every header cell: Clean sets none of its own", () => {
    expect(matchCss).not.toMatch(/thead th\s*\{[^}]*background/);
    expect(playlistsCss).not.toMatch(/thead th\s*\{[^}]*background/);
  });
});
