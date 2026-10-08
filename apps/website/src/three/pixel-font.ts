/**
 * A 3 x 5 pixel font for the small tags the records carry in the home page's opening scene (SITE-06):
 * a key like "8A", a tempo like "126" and a genre like "HSE". Only the characters those use are drawn;
 * `layoutLabel` throws, naming the character, for any other, so a new tag cannot silently print a gap.
 *
 * A label is a mask of on/off cells. The scene paints it into a nearest-neighbor texture in the active
 * theme's colors, so a texel stays a hard square at any size (voxel.ts: pixelTexture).
 */

export const GLYPH_WIDTH = 3;
export const GLYPH_HEIGHT = 5;

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "0": ["###", "# #", "# #", "# #", "###"],
  "1": [" # ", "## ", " # ", " # ", "###"],
  "2": ["###", "  #", "###", "#  ", "###"],
  "3": ["###", "  #", "###", "  #", "###"],
  "4": ["# #", "# #", "###", "  #", "  #"],
  "5": ["###", "#  ", "###", "  #", "###"],
  "6": ["###", "#  ", "###", "# #", "###"],
  "7": ["###", "  #", "  #", "  #", "  #"],
  "8": ["###", "# #", "###", "# #", "###"],
  "9": ["###", "# #", "###", "  #", "###"],
  A: [" # ", "# #", "###", "# #", "# #"],
  B: ["## ", "# #", "## ", "# #", "## "],
  C: ["###", "#  ", "#  ", "#  ", "###"],
  D: ["## ", "# #", "# #", "# #", "## "],
  E: ["###", "#  ", "###", "#  ", "###"],
  H: ["# #", "# #", "###", "# #", "# #"],
  I: ["###", " # ", " # ", " # ", "###"],
  N: ["###", "# #", "# #", "# #", "# #"],
  O: ["###", "# #", "# #", "# #", "###"],
  P: ["###", "# #", "###", "#  ", "#  "],
  R: ["## ", "# #", "## ", "# #", "# #"],
  S: ["###", "#  ", "###", "  #", "###"],
  T: ["###", " # ", " # ", " # ", " # "],
  U: ["# #", "# #", "# #", "# #", "###"],
  "-": ["   ", "   ", "###", "   ", "   "],
};

export function hasGlyph(ch: string): boolean {
  return Object.prototype.hasOwnProperty.call(GLYPHS, ch);
}

export interface LabelMask {
  width: number;
  height: number;
  /** Row-major, top row first; true where a letter's pixel is. */
  mask: boolean[];
}

const lineWidth = (n: number): number => (n === 0 ? 0 : n * GLYPH_WIDTH + (n - 1));

/** Lines of text as one mask: a blank column between letters, a blank row between lines, each line centered. */
export function layoutLabel(lines: readonly string[]): LabelMask {
  const width = Math.max(...lines.map((l) => lineWidth(l.length)), 0);
  const height = lines.length * GLYPH_HEIGHT + Math.max(0, lines.length - 1);
  const mask = new Array<boolean>(width * height).fill(false);
  lines.forEach((line, row) => {
    const left = Math.floor((width - lineWidth(line.length)) / 2);
    const top = row * (GLYPH_HEIGHT + 1);
    [...line].forEach((ch, col) => {
      const glyph = GLYPHS[ch];
      if (!glyph) throw new Error(`pixel-font: no glyph for "${ch}" in "${line}"`);
      const x0 = left + col * (GLYPH_WIDTH + 1);
      for (let y = 0; y < GLYPH_HEIGHT; y++) {
        for (let x = 0; x < GLYPH_WIDTH; x++) {
          if (glyph[y]![x] === "#") mask[(top + y) * width + x0 + x] = true;
        }
      }
    });
  });
  return { width, height, mask };
}
