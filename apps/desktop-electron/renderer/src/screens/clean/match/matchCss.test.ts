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

  it("puts the Playlists bar on the between-tone with a divider above it", () => {
    const bar = bodyOf(playlistsCss, ".playlists__footer");
    expect(bar).toMatch(/background:\s*var\(--bg-between\)/);
    expect(bar).toMatch(/border-top:\s*var\(--divider\)/);
  });
});

describe("Past matches never raise a sideways scrollbar (M142)", () => {
  it("hides the table's sideways overflow, which is only a pixel or two", () => {
    expect(bodyOf(matchCss, ".match-past__scroll")).toMatch(/overflow-x:\s*hidden/);
  });
});
