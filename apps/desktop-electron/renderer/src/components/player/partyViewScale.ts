/**
 * How big the crowd is drawn in the Party view. The art is 232 x 130 pixels; it lands on whole
 * device pixels when its size in device pixels is a whole multiple of that. Works in CSS pixels
 * so the box is `multiple * art / dpr`: at a device pixel ratio of 1.5 a 3x scene is 464 CSS px
 * wide, which is 696 device pixels.
 */
export const CROWD_ART_WIDTH = 232;
export const CROWD_ART_HEIGHT = 130;

export interface PartyScale {
  /** Whole device pixels per art pixel, or 0 where even 1x does not fit (then the fit is fractional). */
  multiple: number;
  /** The scene's box in CSS pixels. */
  width: number;
  height: number;
}

/**
 * The largest whole multiple that fits `availW` x `availH` CSS pixels (width and height both), at
 * least 1x. A stage too small for 1x gets the art shrunk to fit instead, so it never overflows.
 * Nothing measured (zero or not finite) returns null: the stylesheet's fit is left alone.
 */
export function partyScale(availW: number, availH: number, dpr: number): PartyScale | null {
  if (!(availW > 0) || !(availH > 0)) return null;
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const fit = Math.min((availW * ratio) / CROWD_ART_WIDTH, (availH * ratio) / CROWD_ART_HEIGHT);
  const multiple = Math.floor(fit);
  if (multiple < 1) {
    // Too small for 1x: shrink to fit, in CSS pixels.
    const k = Math.min(availW / CROWD_ART_WIDTH, availH / CROWD_ART_HEIGHT);
    return { multiple: 0, width: CROWD_ART_WIDTH * k, height: CROWD_ART_HEIGHT * k };
  }
  return { multiple, width: (CROWD_ART_WIDTH * multiple) / ratio, height: (CROWD_ART_HEIGHT * multiple) / ratio };
}
