/**
 * The frame budget (SITE-05). Pure: the Stage feeds it frame times and applies what it reports.
 *
 * It starts at min(devicePixelRatio, 2) with a 1024 shadow map and 4 CSS pixels per scene pixel. While
 * frames run long it steps down, one step per window of frames, in this order:
 *   1. the pixel ratio, 2 toward 1 in quarter steps;
 *   2. the shadow map, 1024 then 512 then off (0);
 *   3. the scene pixel size, 4 then 5 then 6 CSS pixels (fewer, bigger pixels: less to draw).
 * It never steps back up: a device that was slow once is not asked again.
 */
export const MAX_DPR = 2;
export const MIN_DPR = 1;
/** A frame budget a little over 60 fps: the average above this steps down. */
export const LONG_FRAME_MS = 20;
export const SHADOW_SIZES = [1024, 512, 0] as const;
export const PIXEL_SIZES = [4, 5, 6] as const;
const DPR_STEP = 0.25;
const WINDOW = 30;

export class FrameBudget {
  private ratio: number;
  private shadowIndex = 0;
  private pixelIndex = 0;
  private samples: number[] = [];

  constructor(devicePixelRatio: number) {
    this.ratio = Math.max(MIN_DPR, Math.min(MAX_DPR, devicePixelRatio));
  }

  get dpr(): number {
    return this.ratio;
  }

  /** The shadow map's side in texels; 0 means shadows are off. */
  get shadowSize(): number {
    return SHADOW_SIZES[this.shadowIndex]!;
  }

  /** CSS pixels per scene pixel. */
  get pixelSize(): number {
    return PIXEL_SIZES[this.pixelIndex]!;
  }

  /**
   * Device pixels per scene pixel on the canvas: a whole number, so every scene pixel is a square of
   * the same size and nearest-neighbor scaling never makes uneven pixels.
   */
  get backbufferScale(): number {
    return Math.max(1, Math.round(this.pixelSize * this.ratio));
  }

  /**
   * Records one frame's duration (ms). `ms` is the interval between two animation frames (the rAF
   * interval), not the time spent drawing: it is what the visitor sees, and it includes waiting for the
   * display. Returns true when a setting just changed. A frame over 250 ms (a shader compile, a tab
   * coming back) is a stall, not a trend, and is ignored.
   */
  frame(ms: number): boolean {
    if (ms > 250) return false;
    this.samples.push(ms);
    if (this.samples.length < WINDOW) return false;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples = [];
    if (avg <= LONG_FRAME_MS) return false;
    if (this.ratio > MIN_DPR) this.ratio = Math.max(MIN_DPR, this.ratio - DPR_STEP);
    else if (this.shadowIndex < SHADOW_SIZES.length - 1) this.shadowIndex += 1;
    else if (this.pixelIndex < PIXEL_SIZES.length - 1) this.pixelIndex += 1;
    else return false;
    return true;
  }
}
