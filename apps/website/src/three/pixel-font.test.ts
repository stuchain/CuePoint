import { describe, expect, it } from "vitest";
import { GLYPH_GAP, GLYPH_HEIGHT, GLYPH_WIDTH, glyphRows, hasGlyph, layoutLabel } from "./pixel-font";

/** The 24 Camelot keys the records carry, 1A to 12B. */
const KEYS = Array.from({ length: 24 }, (_, i) => `${Math.floor(i / 2) + 1}${i % 2 === 0 ? "A" : "B"}`);

/** The texels of a glyph that are on, as [column, row]. */
const texels = (ch: string): [number, number][] => {
  const out: [number, number][] = [];
  glyphRows(ch).forEach((row, y) => [...row].forEach((c, x) => c === "#" && out.push([x, y])));
  return out;
};

describe("the pixel font for the records' labels", () => {
  it("draws every character the labels use: digits, the key letters and the genre letters", () => {
    for (const ch of "0123456789AB") expect(hasGlyph(ch), ch).toBe(true);
    for (const ch of "HOUSETCNDIRP-") expect(hasGlyph(ch), ch).toBe(true);
  });

  it("draws every glyph GLYPH_HEIGHT tall and no wider than 4, with no empty edge column", () => {
    for (const ch of "0123456789ABCDEHINOPRSTU") {
      const rows = glyphRows(ch);
      expect(rows, ch).toHaveLength(GLYPH_HEIGHT);
      expect(new Set(rows.map((r) => r.length)).size, ch).toBe(1);
      expect(rows[0]!.length, ch).toBeLessThanOrEqual(GLYPH_WIDTH + 1);
      expect(rows.some((r) => r[0] === "#"), `${ch} left edge`).toBe(true);
      expect(rows.some((r) => r[r.length - 1] === "#"), `${ch} right edge`).toBe(true);
    }
  });

  it("lays out one line as a mask of GLYPH_HEIGHT rows with GLYPH_GAP columns between letters", () => {
    const one = layoutLabel(["8A"]);
    expect(one.height).toBe(GLYPH_HEIGHT);
    expect(one.width).toBe(3 + GLYPH_GAP + 3);
    expect(one.mask).toHaveLength(one.width * one.height);
    expect(one.mask.some(Boolean)).toBe(true);
    expect(layoutLabel(["10B"]).width).toBe(2 + GLYPH_GAP + 3 + GLYPH_GAP + 4);
  });

  it("stacks lines with a row between them and centres each", () => {
    const l = layoutLabel(["8A", "126", "HSE"]);
    expect(l.height).toBe(3 * GLYPH_HEIGHT + 2);
    expect(l.width).toBe(3 * GLYPH_WIDTH + 2 * GLYPH_GAP);
  });

  it("throws, naming the character, for one it cannot draw", () => {
    expect(() => layoutLabel(["8Z"])).toThrow(/Z/);
  });

  it("puts at least one texel between a label's letters", () => {
    expect(GLYPH_GAP).toBeGreaterThanOrEqual(1);
  });
});

describe("the 24 Camelot keys through the font", () => {
  it("draws every glyph differently from every other, the look-alikes by more than one texel", () => {
    const chars = [..."0123456789AB"]; // the key alphabet (the genre letters O and S are the digits 0 and 5 on purpose)
    const seen = new Map<string, string>();
    for (const ch of chars) {
      const shape = glyphRows(ch).join("/");
      expect(seen.get(shape), `${ch} is drawn like ${seen.get(shape)}`).toBeUndefined();
      seen.set(shape, ch);
    }
    const differ = (a: string, b: string): number => {
      const ra = glyphRows(a);
      const rb = glyphRows(b);
      if (ra[0]!.length !== rb[0]!.length) return Infinity;
      let n = 0;
      ra.forEach((row, y) => [...row].forEach((c, x) => c !== rb[y]![x] && n++));
      return n;
    };
    for (const [a, b] of [["8", "B"], ["A", "B"], ["8", "A"], ["8", "6"], ["8", "9"], ["1", "7"]] as const) {
      expect(differ(a, b), `${a} against ${b}`).toBeGreaterThanOrEqual(2);
    }
  });

  for (const key of KEYS) {
    it(`renders ${key} with every glyph in place and none touching its neighbor`, () => {
      const { width, height, mask } = layoutLabel([key]);
      expect(height).toBe(GLYPH_HEIGHT);
      let x0 = 0;
      const cells: [number, number][][] = [];
      for (const ch of key) {
        const w = glyphRows(ch)[0]!.length;
        const mine = texels(ch).map(([x, y]) => [x0 + x, y] as [number, number]);
        // the glyph's own columns hold its texels and nothing else
        for (let y = 0; y < height; y++) {
          for (let x = x0; x < x0 + w; x++) {
            expect(mask[y * width + x], `${key}: ${ch} at ${x},${y}`).toBe(mine.some(([mx, my]) => mx === x && my === y));
          }
        }
        cells.push(mine);
        x0 += w + GLYPH_GAP;
      }
      expect(x0 - GLYPH_GAP).toBe(width);
      for (const c of cells) expect(c.length).toBeGreaterThan(0);
      // no texel of one glyph touches one of the next, not even at a corner
      for (let g = 0; g + 1 < cells.length; g++) {
        for (const [ax, ay] of cells[g]!) {
          for (const [bx, by] of cells[g + 1]!) {
            expect(Math.max(Math.abs(ax - bx), Math.abs(ay - by)), `${key}: glyph ${g} and ${g + 1}`).toBeGreaterThanOrEqual(2);
          }
        }
      }
    });
  }

  it("draws every key as a different mask", () => {
    const masks = new Set(KEYS.map((k) => JSON.stringify(layoutLabel([k]))));
    expect(masks.size).toBe(KEYS.length);
  });
});
