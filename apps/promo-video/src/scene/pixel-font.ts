/**
 * A 5-texel-tall pixel font for the small tags the records carry in the home page's opening scene (SITE-06):
 * a Camelot key like "8A" or "10B". Only the characters those use are drawn; `layoutLabel` throws, naming
 * the character, for any other, so a new tag cannot silently print a gap.
 *
 * A label is a mask of on/off cells. The scene paints it into a nearest-neighbor texture in the active
 * theme's colors, so a texel stays a hard square at any size (voxel.ts: pixelTexture).
 *
 * Most glyphs are 3 texels wide. A "1" is 2 wide and a "B" is 4 wide, so that "8" and "B" cannot be
 * mistaken for each other, nor "A" and "B", and "11" and "12" stay narrow enough for a sleeve.
 */

/** The widest ordinary glyph's width and every glyph's height, in texels. */
export const GLYPH_WIDTH = 3;
export const GLYPH_HEIGHT = 5;
/** Empty columns between two letters of a line: at least one texel, so neighbors never touch. */
export const GLYPH_GAP = 1;

const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "0": ["###", "# #", "# #", "# #", "###"],
  "1": [" #", "##", " #", " #", " #"],
  "2": ["###", "  #", "###", "#  ", "###"],
  "3": ["###", "  #", "###", "  #", "###"],
  "4": ["# #", "# #", "###", "  #", "  #"],
  "5": ["###", "#  ", "###", "  #", "###"],
  "6": [" ##", "#  ", "###", "# #", "###"],
  "7": ["###", "  #", "  #", "  #", "  #"],
  "8": ["###", "# #", "###", "# #", "###"],
  "9": ["###", "# #", "###", "  #", "## "],
  A: [" # ", "# #", "###", "# #", "# #"],
  B: ["### ", "#  #", "### ", "#  #", "### "],
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

/** One letter's rows, "#" for a texel that is on. Throws, naming the character, for one the font does not draw. */
export function glyphRows(ch: string): readonly string[] {
  const glyph = GLYPHS[ch];
  if (!glyph) throw new Error(`pixel-font: no glyph for "${ch}"`);
  return glyph;
}

export interface LabelMask {
  width: number;
  height: number;
  /** Row-major, top row first; true where a letter's pixel is. */
  mask: boolean[];
}

const lineWidth = (line: string): number => [...line].reduce((sum, ch, k) => sum + glyphRows(ch)[0]!.length + (k === 0 ? 0 : GLYPH_GAP), 0);

/** Lines of text as one mask: a blank column between letters, a blank row between lines, each line centered. */
export function layoutLabel(lines: readonly string[]): LabelMask {
  const width = Math.max(...lines.map(lineWidth), 0);
  const height = lines.length * GLYPH_HEIGHT + Math.max(0, lines.length - 1);
  const mask = new Array<boolean>(width * height).fill(false);
  lines.forEach((line, row) => {
    let x0 = Math.floor((width - lineWidth(line)) / 2);
    const top = row * (GLYPH_HEIGHT + 1);
    for (const ch of line) {
      const glyph = glyphRows(ch);
      for (let y = 0; y < GLYPH_HEIGHT; y++) {
        for (let x = 0; x < glyph[y]!.length; x++) {
          if (glyph[y]![x] === "#") mask[(top + y) * width + x0 + x] = true;
        }
      }
      x0 += glyph[0]!.length + GLYPH_GAP;
    }
  });
  return { width, height, mask };
}
