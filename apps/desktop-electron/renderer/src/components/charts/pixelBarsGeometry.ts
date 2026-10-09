/**
 * Where a PixelBars chart puts its bars, axes and words (STATS-06).
 *
 * Pure: buckets, an orientation, the room there is and the app's scale go in, and
 * whole-pixel rectangles and text positions come out, so `PixelBars.tsx` only
 * draws them and this file is tested without a DOM. The pattern is
 * `screens/prepare/prepareLanes.ts`'s.
 *
 * Every size is a base size times the scale, rounded to a whole pixel (`px`), and
 * every position is a sum of those, so each edge lands on a whole pixel at 1x,
 * 1.5x, 2x and 3x (DEC-161). The tallest bar fills the plot; a bucket with no
 * tracks draws no rectangle at all; any other bar is at least one pixel.
 */
import { formatCount } from "./formatCount";


export interface PixelBucket {
  label: string;
  count: number;
}

/** Named buckets (genre, rating) run as rows; ordered ones (tempo, year) as columns. */
export type BarsOrientation = "horizontal" | "vertical";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextMark {
  text: string;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
}

export interface BarGeometry {
  index: number;
  bucket: PixelBucket;
  /** The bar; null for an empty bucket. */
  rect: Rect | null;
  /** The bar's black outline, a hairline larger on every side; null for an empty bucket. */
  outline: Rect | null;
  /** The whole slot the bar owns, which is what a pointer or a focus ring takes. */
  hit: Rect;
  /** Its count, written beside the bar's end. Every bucket has one, even a zero. */
  count: TextMark;
  /** Its name on the axis; null where a crowded axis skips it. */
  label: TextMark | null;
}

export interface BarsLayout {
  orientation: BarsOrientation;
  width: number;
  height: number;
  bars: BarGeometry[];
  /** The baseline the bars stand on (a hairline wide). */
  axis: Rect;
  /** The plot's own extent along the bar's length, which the tallest bar fills. */
  plot: { length: number };
  /** Horizontal only: the width of the name column, which clips its names (0 when vertical). */
  labelWidth: number;
  /** The font the text is set in, in pixels (`--font-size-xs`). */
  fontSize: number;
  hairline: number;
}

export interface BarsLayoutInput {
  buckets: readonly PixelBucket[];
  orientation: BarsOrientation;
  /** The room the chart's own container gives it, in pixels. A long ordered run grows past it. */
  width: number;
  /** Vertical only: the chart's height in pixels. Horizontal charts are as tall as their rows. */
  height: number;
  /** The app's scale: 1, 1.5, 2 or 3. */
  scale: number;
}

/** The longest name drawn on a row before it is cut short with an ellipsis. */
export const MAX_LABEL_CHARS = 22;

const ELLIPSIS = "…";

/** A base size at this scale, on a whole pixel and never less than one. */
function sizer(scale: number): (base: number) => number {
  return (base) => Math.max(1, Math.round(base * scale));
}

function countText(count: number): string {
  return formatCount(count);
}

function shorten(label: string): string {
  const chars = [...label];
  return chars.length <= MAX_LABEL_CHARS ? label : `${chars.slice(0, MAX_LABEL_CHARS - 1).join("").trimEnd()}${ELLIPSIS}`;
}

export function barsLayout(input: BarsLayoutInput): BarsLayout {
  return input.orientation === "horizontal" ? rows(input) : columns(input);
}

/** `length` along an axis for a count, the tallest being the whole `full`; any real bar is a pixel. */
function lengthFor(count: number, biggest: number, full: number): number {
  if (count <= 0 || biggest <= 0) return 0;
  return Math.max(1, Math.round((count / biggest) * full));
}

function rows({ buckets, width, scale }: BarsLayoutInput): BarsLayout {
  const px = sizer(scale);
  const hair = Math.max(1, Math.floor(scale));
  const fontSize = px(10);
  const charW = px(6);
  const rowH = px(14);
  const barH = px(10);
  const biggest = Math.max(0, ...buckets.map((b) => b.count));

  const labelChars = Math.min(MAX_LABEL_CHARS, Math.max(0, ...buckets.map((b) => [...b.label].length)));
  const countChars = Math.max(1, ...buckets.map((b) => countText(b.count).length));
  const labelW = labelChars * charW;
  const countW = countChars * charW;
  const axisX = labelW + px(6);
  const barX = axisX + 2 * hair;
  const textGap = px(4);
  const minLength = px(24);
  const room = width - barX - hair - textGap - countW;
  const length = Math.max(minLength, room);
  const total = barX + length + hair + textGap + countW;
  const height = Math.max(rowH, buckets.length * rowH);
  const baseline = Math.round(fontSize * 0.35);

  const bars = buckets.map((bucket, index): BarGeometry => {
    const top = index * rowH;
    const y = top + Math.floor((rowH - barH) / 2);
    const long = lengthFor(bucket.count, biggest, length);
    const mid = top + Math.floor(rowH / 2) + baseline;
    const rect = long > 0 ? { x: barX, y, width: long, height: barH } : null;
    return {
      index,
      bucket,
      rect,
      outline: rect ? { x: rect.x - hair, y: rect.y - hair, width: rect.width + 2 * hair, height: rect.height + 2 * hair } : null,
      hit: { x: 0, y: top, width: total, height: rowH },
      count: { text: countText(bucket.count), x: barX + long + hair + textGap, y: mid, anchor: "start" },
      label: { text: shorten(bucket.label), x: 0, y: mid, anchor: "start" },
    };
  });

  return {
    orientation: "horizontal",
    width: total,
    height,
    bars,
    axis: { x: axisX, y: 0, width: hair, height },
    plot: { length },
    labelWidth: labelW,
    fontSize,
    hairline: hair,
  };
}

function columns({ buckets, width, height, scale }: BarsLayoutInput): BarsLayout {
  const px = sizer(scale);
  const hair = Math.max(1, Math.floor(scale));
  const fontSize = px(10);
  const charW = px(6);
  const biggest = Math.max(0, ...buckets.map((b) => b.count));

  const countChars = Math.max(1, ...buckets.map((b) => countText(b.count).length));
  const labelChars = Math.max(1, ...buckets.map((b) => [...b.label].length));
  const gap = px(6);
  const minPitch = Math.max(px(14) + gap, countChars * charW + px(2));
  const maxPitch = px(40) + gap;
  const fit = buckets.length > 0 ? Math.floor(width / buckets.length) : minPitch;
  const pitch = Math.max(minPitch, Math.min(fit, maxPitch));
  const barW = Math.max(1, pitch - gap);
  const inset = Math.floor((pitch - barW) / 2);

  // Words above the tallest bar, the axis, then the names under it.
  const top = fontSize + px(2) + hair;
  const bottom = hair + px(2) + fontSize + px(2);
  const total = Math.max(top + bottom + px(16), Math.round(height));
  const length = total - top - bottom;
  const baseY = top + length;
  const totalW = Math.max(1, buckets.length * pitch);
  const labelEvery = Math.max(1, Math.ceil((labelChars * charW + px(4)) / pitch));

  const bars = buckets.map((bucket, index): BarGeometry => {
    const slot = index * pitch;
    const x = slot + inset;
    const tall = lengthFor(bucket.count, biggest, length);
    const rect = tall > 0 ? { x, y: baseY - tall, width: barW, height: tall } : null;
    const centre = x + Math.floor(barW / 2);
    const spread = labelEvery === 1;
    // A thinned name starts at its bar; the last ones would run off the chart, so they end at theirs.
    const runsOff = x + [...bucket.label].length * charW > totalW;
    const anchor: TextMark["anchor"] = spread ? "middle" : runsOff ? "end" : "start";
    return {
      index,
      bucket,
      rect,
      outline: rect ? { x: rect.x - hair, y: rect.y - hair, width: rect.width + 2 * hair, height: rect.height + hair } : null,
      hit: { x: slot, y: 0, width: pitch, height: total },
      count: { text: countText(bucket.count), x: centre, y: baseY - tall - hair - px(2), anchor: "middle" },
      label:
        index % labelEvery === 0
          ? { text: bucket.label, x: spread ? centre : anchor === "end" ? x + barW : x, y: baseY + hair + px(2) + fontSize, anchor }
          : null,
    };
  });

  return {
    orientation: "vertical",
    width: totalW,
    height: total,
    bars,
    axis: { x: 0, y: baseY, width: totalW, height: hair },
    plot: { length },
    labelWidth: 0,
    fontSize,
    hairline: hair,
  };
}
