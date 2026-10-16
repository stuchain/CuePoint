/**
 * The true minus sign for a chart (area 68): "−19", not "-19". A hyphen-minus in the pixel or the
 * data face reads as a dash; U+2212 is as wide as a plus and sits at the height of the digits.
 * It replaces a "-" that starts a number (at the start of the text, or after a space or "("), so a
 * range like "60-70" and a word like "Re-match" keep their hyphen.
 */
export const MINUS = "−";

export function trueMinus(text: string): string {
  return text.replace(/(^|[\s(])-(?=\d)/g, `$1${MINUS}`);
}
