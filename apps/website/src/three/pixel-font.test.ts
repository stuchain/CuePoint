import { describe, expect, it } from "vitest";
import { GLYPH_HEIGHT, GLYPH_WIDTH, hasGlyph, layoutLabel } from "./pixel-font";

describe("the pixel font for the records' labels", () => {
  it("draws every character the labels use: digits, the key letters and the genre letters", () => {
    for (const ch of "0123456789AB") expect(hasGlyph(ch), ch).toBe(true);
    for (const ch of "HOUSETCNDIRP-") expect(hasGlyph(ch), ch).toBe(true);
  });

  it("lays out one line as a mask of GLYPH_WIDTH x GLYPH_HEIGHT cells with a column between letters", () => {
    const one = layoutLabel(["8A"]);
    expect(one.height).toBe(GLYPH_HEIGHT);
    expect(one.width).toBe(2 * GLYPH_WIDTH + 1);
    expect(one.mask).toHaveLength(one.width * one.height);
    expect(one.mask.some(Boolean)).toBe(true);
  });

  it("stacks lines with a row between them and centres each", () => {
    const l = layoutLabel(["8A", "126", "HSE"]);
    expect(l.height).toBe(3 * GLYPH_HEIGHT + 2);
    expect(l.width).toBe(3 * GLYPH_WIDTH + 2);
  });

  it("gives different letters different pixels", () => {
    expect(layoutLabel(["8"]).mask).not.toEqual(layoutLabel(["A"]).mask);
    expect(layoutLabel(["A"]).mask).not.toEqual(layoutLabel(["B"]).mask);
  });

  it("throws, naming the character, for one it cannot draw", () => {
    expect(() => layoutLabel(["8Z"])).toThrow(/Z/);
  });
});
