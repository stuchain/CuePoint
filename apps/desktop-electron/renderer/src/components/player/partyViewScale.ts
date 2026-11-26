/**
 * How the Party view fits the club to its stage. The club is at least 232 x 130 logical pixels and
 * grows with the window (up to 640 x 360, so it stays light). The scale (device pixels per logical
 * pixel) is a whole number, so the art lands on whole device pixels; the logical size is then the
 * stage's size in logical pixels, so the club fills the stage with no bars: what is left over is
 * under one logical pixel in each direction (the stage crops it). Works in CSS pixels: the box is
 * `logical * multiple / dpr`, so at a device pixel ratio of 1.5 a 3x club of 232 is 464 CSS px wide,
 * which is 696 device pixels.
 */
import { CROWD_HEIGHT, CROWD_MAX_HEIGHT, CROWD_MAX_WIDTH, CROWD_WIDTH } from "../crowd/crowdSprites";

export interface PartyScale {
  /** Whole device pixels per logical pixel, or 0 where even 1x does not fit (then the fit is fractional). */
  multiple: number;
  /** The club's size in logical pixels: what the scene is drawn at. */
  logicalWidth: number;
  logicalHeight: number;
  /** The canvas's CSS box, exactly `logical * multiple / dpr`. */
  width: number;
  height: number;
}

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

/**
 * The largest whole multiple at which the smallest club (232 x 130) fits `availW` x `availH`, at
 * least 1x; the club is then as big as the stage is at that scale, within its limits. A stage too
 * small for 1x gets the art shrunk to fit instead. Nothing measured (zero or not finite) returns
 * null: the stylesheet's fit is left alone.
 */
export function partyScale(availW: number, availH: number, dpr: number): PartyScale | null {
  if (!(availW > 0) || !(availH > 0)) return null;
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const multiple = Math.floor(Math.min((availW * ratio) / CROWD_WIDTH, (availH * ratio) / CROWD_HEIGHT));
  // CSS pixels per logical pixel.
  const unit = multiple >= 1 ? multiple / ratio : Math.min(availW / CROWD_WIDTH, availH / CROWD_HEIGHT);
  const logicalWidth = clamp(Math.floor(availW / unit), CROWD_WIDTH, CROWD_MAX_WIDTH);
  const logicalHeight = clamp(Math.floor(availH / unit), CROWD_HEIGHT, CROWD_MAX_HEIGHT);
  return {
    multiple: Math.max(0, multiple),
    logicalWidth,
    logicalHeight,
    width: logicalWidth * unit,
    height: logicalHeight * unit,
  };
}
