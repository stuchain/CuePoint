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
 * tracks draws no rectangle and no count; any other bar is at least one pixel. A gap bucket
 * (`isGap`) is a narrow break in an ordered run: no bar, no count, just its mark.
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
  /** A narrow break in the run, not a bucket: it has no bar and no count. */
  gap: boolean;
  /** Its count, written beside the bar's end; null for an empty bucket and for a gap. */
  count: TextMark | null;
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
  /**
   * Vertical charts only. `"scroll"` (the default) keeps each bar a comfortable width and lets a
   * long run scroll sideways; `"width"` makes the bars fill the container, however wide or narrow.
   */
  fit?: "scroll" | "width";
  orientation: BarsOrientation;
  /** The room the chart's own container gives it, in pixels. A long ordered run grows past it. */
  width: number;
  /** Vertical only: the chart's height in pixels. Horizontal charts are as tall as their rows. */
  height: number;
  /** The app's scale: 1, 1.25, 1.5, 2 or 3. */
  scale: number;
  /**
   * Marks a bucket that is a break in the run, not a count. Default: none is. Gaps belong to
   * vertical (column) charts; in rows a gap is a short, empty row.
   */
  isGap?: (bucket: PixelBucket) => boolean;
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

function rows({ buckets, width, scale, isGap }: BarsLayoutInput): BarsLayout {
  const px = sizer(scale);
  const hair = Math.max(1, Math.floor(scale));
  const fontSize = px(10);
  const charW = px(6);
  const rowH = px(14);
  const barH = px(10);
  const gapAt = (b: PixelBucket) => isGap?.(b) ?? false;
  const biggest = Math.max(0, ...buckets.filter((b) => !gapAt(b)).map((b) => b.count));

  const labelChars = Math.min(MAX_LABEL_CHARS, Math.max(0, ...buckets.map((b) => [...b.label].length)));
  const countChars = Math.max(1, ...buckets.map((b) => (gapAt(b) ? 0 : countText(b.count).length)));
  const labelW = labelChars * charW;
  const countW = countChars * charW;
  const axisX = labelW + px(6);
  const barX = axisX + 2 * hair;
  const textGap = px(4);
  const minLength = px(24);
  const room = width - barX - hair - textGap - countW;
  const length = Math.max(minLength, room);
  const total = barX + length + hair + textGap + countW;
  const gapH = px(8);
  const heightOf = (b: PixelBucket) => (gapAt(b) ? gapH : rowH);
  const height = Math.max(rowH, buckets.reduce((sum, b) => sum + heightOf(b), 0));
  let rowTop = 0;
  const baseline = Math.round(fontSize * 0.35);

  const bars = buckets.map((bucket, index): BarGeometry => {
    const top = rowTop;
    const gap = gapAt(bucket);
    const thisH = heightOf(bucket);
    rowTop += thisH;
    const y = top + Math.floor((thisH - barH) / 2);
    const long = gap ? 0 : lengthFor(bucket.count, biggest, length);
    const mid = top + Math.floor(thisH / 2) + baseline;
    const rect = long > 0 ? { x: barX, y, width: long, height: barH } : null;
    return {
      index,
      bucket,
      rect,
      outline: rect ? { x: rect.x - hair, y: rect.y - hair, width: rect.width + 2 * hair, height: rect.height + 2 * hair } : null,
      hit: { x: 0, y: top, width: total, height: thisH },
      gap,
      count: gap || bucket.count <= 0 ? null : { text: countText(bucket.count), x: barX + long + hair + textGap, y: mid, anchor: "start" },
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

/**
 * Merges an ordered run into at most `bins` bars by summing neighbours, each labelled from its
 * first to its last bucket ("100–102"). A run already within the count (or a count under one)
 * comes back as it is. The total never changes.
 */
export function rebin<T extends PixelBucket>(buckets: readonly T[], bins: number): PixelBucket[] {
  if (!(bins >= 1) || buckets.length <= bins) return [...buckets];
  const merged: PixelBucket[] = [];
  for (let bin = 0; bin < bins; bin += 1) {
    const from = Math.floor((bin * buckets.length) / bins);
    const to = Math.floor(((bin + 1) * buckets.length) / bins);
    const group = buckets.slice(from, to);
    if (group.length === 0) continue;
    const first = group[0]!.label;
    const last = group[group.length - 1]!.label;
    merged.push({
      label: group.length === 1 ? first : `${first}\u2013${last}`,
      count: group.reduce((sum, b) => sum + b.count, 0),
    });
  }
  return merged;
}

function columns({ buckets, width, height, scale, isGap, fit = "scroll" }: BarsLayoutInput): BarsLayout {
  const px = sizer(scale);
  const hair = Math.max(1, Math.floor(scale));
  const fontSize = px(10);
  const charW = px(6);
  const gapAt = (b: PixelBucket) => isGap?.(b) ?? false;
  const real = buckets.filter((b) => !gapAt(b));
  const biggest = Math.max(0, ...real.map((b) => b.count));

  const countChars = Math.max(1, ...real.map((b) => countText(b.count).length));
  const labelChars = Math.max(1, ...real.map((b) => [...b.label].length));
  const fitted = fit === "width";
  const minPitch = Math.max(px(14) + px(6), countChars * charW + px(2));
  const maxPitch = px(40) + px(6);
  // A gap is a narrow break, a little over one character wide.
  const gapPitch = px(12);
  const room = real.length > 0 ? Math.floor((width - (buckets.length - real.length) * gapPitch) / real.length) : minPitch;
  // Fitted to the width, the bars take whatever the container gives (a pixel at the least);
  // otherwise they stay between a readable and a comfortable width and a long run scrolls.
  const pitch = fitted ? Math.max(2, width > 0 ? room : minPitch) : Math.max(minPitch, Math.min(room, maxPitch));
  // The space between bars shrinks with a squeezed pitch, so a bar never vanishes into it.
  const gap = fitted ? Math.min(px(6), Math.max(1, Math.floor(pitch / 4))) : px(6);
  const barW = Math.max(1, pitch - gap);
  const inset = Math.floor((pitch - barW) / 2);

  // Words above the tallest bar, the axis, then the names under it.
  const top = fontSize + px(2) + hair;
  const bottom = hair + px(2) + fontSize + px(2);
  const total = Math.max(top + bottom + px(16), Math.round(height));
  const length = total - top - bottom;
  const baseY = top + length;
  const totalW = Math.max(1, real.length * pitch + (buckets.length - real.length) * gapPitch);
  // The plot runs to the container's right edge (M214): a short run's bars keep their comfortable
  // width, and its baseline reaches the card's content edge.
  const plotW = Math.max(totalW, Math.floor(width));
  // Every bar's count, or none (D22 A, M214): a count is written only where it fits its own column,
  // and one that does not would leave some bars labelled and others bare.
  const countsFit = real.every((b) => b.count <= 0 || [...countText(b.count)].length * charW + px(2) <= pitch);
  const labelEvery = Math.max(1, Math.ceil((labelChars * charW + px(4)) / pitch));
  const labelGap = px(4);
  // Labels are thinned by where they land, not by index, so a narrow gap slot cannot be overrun.
  let lastLabelEnd = -Infinity;
  // A gap's ⋯ is always drawn (it is the meaning of the slot), so a name just before it yields.
  const place = (text: string, start: number, force = false, before?: number): boolean => {
    if (!force && start < lastLabelEnd + labelGap) return false;
    if (before !== undefined && start + [...text].length * charW + labelGap > before) return false;
    lastLabelEnd = start + [...text].length * charW;
    return true;
  };

  // Where the next slot's ⋯ starts, if the next bucket is a gap (by its own slot width).
  const gapStartAfter = (index: number, from: number): number | undefined => {
    const next = buckets[index + 1];
    if (!next || !gapAt(next)) return undefined;
    return from + pitch + Math.floor(gapPitch / 2) - Math.floor(([...next.label].length * charW) / 2);
  };

  let slot = 0;
  const bars = buckets.map((bucket, index): BarGeometry => {
    if (gapAt(bucket)) {
      const at = slot;
      slot += gapPitch;
      const centre = at + Math.floor(gapPitch / 2);
      const gapW = [...bucket.label].length * charW;
      return {
        index,
        bucket,
        rect: null,
        outline: null,
        hit: { x: at, y: 0, width: gapPitch, height: total },
        gap: true,
        count: null,
        label: place(bucket.label, centre - Math.floor(gapW / 2), true)
          ? { text: bucket.label, x: centre, y: baseY + hair + px(2) + fontSize, anchor: "middle" }
          : null,
      };
    }
    const here = slot;
    slot += pitch;
    const x = here + inset;
    const tall = lengthFor(bucket.count, biggest, length);
    const rect = tall > 0 ? { x, y: baseY - tall, width: barW, height: tall } : null;
    const centre = x + Math.floor(barW / 2);
    const spread = labelEvery === 1;
    // A thinned name starts at its bar; the last ones would run off the chart, so they end at theirs.
    const runsOff = x + [...bucket.label].length * charW > totalW;
    const anchor: TextMark["anchor"] = spread ? "middle" : runsOff ? "end" : "start";
    const nameW = [...bucket.label].length * charW;
    const labelX = spread ? centre : anchor === "end" ? x + barW : x;
    const labelStart = anchor === "middle" ? labelX - Math.floor(nameW / 2) : anchor === "end" ? labelX - nameW : labelX;
    return {
      index,
      bucket,
      rect,
      outline: rect ? { x: rect.x - hair, y: rect.y - hair, width: rect.width + 2 * hair, height: rect.height + hair } : null,
      hit: { x: here, y: 0, width: pitch, height: total },
      gap: false,
      // A count is written only where it fits its own column (item 4): fitted to a narrow width,
      // "35" beside "35" ran together as "3535". The value is still on the bar's focus caption and
      // in the chart's table.
      count:
        bucket.count <= 0 || !countsFit
          ? null
          : { text: countText(bucket.count), x: centre, y: baseY - tall - hair - px(2), anchor: "middle" },
      label:
        place(bucket.label, labelStart, false, gapStartAfter(index, here))
          ? { text: bucket.label, x: labelX, y: baseY + hair + px(2) + fontSize, anchor }
          : null,
    };
  });

  return {
    orientation: "vertical",
    width: plotW,
    height: total,
    bars,
    axis: { x: 0, y: baseY, width: plotW, height: hair },
    plot: { length },
    labelWidth: 0,
    fontSize,
    hairline: hair,
  };
}
