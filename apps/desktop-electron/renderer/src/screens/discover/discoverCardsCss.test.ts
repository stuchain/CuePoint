/**
 * C254: a Discover card without a picture shows the shared placeholder as a short band, not a
 * card-wide empty square, and its tick is the bare standard checkbox, not one in a tile.
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../../test/cssRules";
import css from "./discoverCards.css?raw";

const rules = parseRules(stripComments(css));
const body = (selector: string) => rules.find((rule) => rule.selector === selector)?.body ?? "";

describe("Discover cards (C254)", () => {
  it("draws a missing picture as a short band, not a square as wide as the card", () => {
    const placeholder = body(".discover-card__art--placeholder");
    expect(placeholder).toMatch(/aspect-ratio:\s*auto/);
    expect(placeholder).toMatch(/height:\s*var\(--discover-card-placeholder\)/);
  });

  it("puts no tile behind the tick", () => {
    const tick = body(".discover-card__tick");
    expect(tick).not.toMatch(/background/);
    expect(tick).not.toMatch(/padding/);
  });
});

describe("Discover cards, P23", () => {
  it("sits the art on the alt slab, not an accent tint", () => {
    const art = body(".discover-card__art");
    expect(art).toMatch(/background:\s*var\(--bg-panel-alt\)/);
    expect(art).not.toMatch(/accent/);
  });
});
