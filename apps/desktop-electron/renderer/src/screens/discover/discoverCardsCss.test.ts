/**
 * C254, M175, M176: every Discover card has one anatomy, a square picture at the left with the
 * name beside it, the same size with a picture, without one and while it loads; its tick is the
 * bare standard checkbox, not one in a tile, 12 in from the top right.
 */
import { describe, expect, it } from "vitest";

import { parseRules, stripComments } from "../../test/cssRules";
import css from "./discoverCards.css?raw";

const rules = parseRules(stripComments(css));
const body = (selector: string) => rules.find((rule) => rule.selector === selector)?.body ?? "";

describe("Discover cards (C254)", () => {
  it("draws every picture, placeholder and skeleton as one square beside the name (M175, M176)", () => {
    const art = body(".discover-card__art");
    expect(art).toMatch(/width:\s*var\(--discover-card-art\)/);
    expect(art).toMatch(/height:\s*var\(--discover-card-art\)/);
    expect(body(".discover-card__open")).toMatch(/grid-template-columns:\s*var\(--discover-card-art\)/);
    // No kind has a shape of its own: no band, no inset, no round artist.
    expect(css).not.toMatch(/art--placeholder|art--artist|--discover-card-placeholder/);
  });

  // Moved for M385: the picture fades in once it has loaded, through the shared Art (its own
  // sheet), so no rule here animates it on mount.
  it("fills the placeholder into the picture's square and leaves the picture's fade to Art (M43, M385)", () => {
    expect(body(".discover-card__art .cp-artwork-placeholder")).toMatch(/height:\s*100%/);
    expect(css).not.toMatch(/\.discover-card__art img[^{]*\{[^}]*animation/);
  });

  it("gives a ticked card no ring and no tint: the tick box alone says it (M338)", () => {
    expect(css).not.toMatch(/discover-card--ticked/);
  });

  it("sets the tick 12 in from the top right corner (M175)", () => {
    const tick = body(".discover-card__tick");
    expect(tick).toMatch(/top:\s*var\(--space-lg\)/);
    expect(tick).toMatch(/right:\s*var\(--space-lg\)/);
  });

  it("sets card titles in the pixel face at 400, like the run titles (D1, M16)", () => {
    const title = body(".discover-card__title");
    expect(title).toMatch(/font-family:\s*var\(--font-voice\)/);
    expect(title).toMatch(/font-weight:\s*var\(--font-weight-regular\)/);
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
