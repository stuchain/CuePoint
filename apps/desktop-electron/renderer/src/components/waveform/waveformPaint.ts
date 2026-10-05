/**
 * Filling a waveform's layout onto a canvas (WAVE-05).
 *
 * The one step between `layoutWaveform` and the pixels: each named paint is
 * read from its theme token once per painting, a cue's own colour is used as
 * it is, and loops are drawn translucent. Nothing is decided here that the
 * layout has not already decided.
 */
import { paintOrder, type WaveformLayout, type WaveformPaint } from "./waveformLayout";

/** How strongly a loop tints the waveform under it. */
export const LOOP_ALPHA = 0.3;

/** The token each named paint is filled from. */
export const PAINT_TOKENS: Record<Exclude<WaveformPaint, `#${string}`>, string> = {
  low: "--waveform-low",
  mid: "--waveform-mid",
  high: "--waveform-high",
  mono: "--waveform-mono",
  played: "--waveform-played",
  grid: "--waveform-grid",
  "memory-cue": "--waveform-memory-cue",
  playhead: "--fg-primary",
};

/** What a paint fills with: a cue's own colour, or its token's value here. */
export function resolvePaint(paint: WaveformPaint, style: Pick<CSSStyleDeclaration, "getPropertyValue">): string {
  if (paint.startsWith("#")) return paint;
  const token = PAINT_TOKENS[paint as Exclude<WaveformPaint, `#${string}`>];
  return style.getPropertyValue(token).trim() || "transparent";
}

/** Fill a layout onto a 2D context, in its order. */
export function paintLayout(
  context: Pick<
    CanvasRenderingContext2D,
    "clearRect" | "fillRect" | "fillStyle" | "globalAlpha" | "imageSmoothingEnabled"
  >,
  layout: WaveformLayout,
  style: Pick<CSSStyleDeclaration, "getPropertyValue">,
): void {
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, layout.width, layout.height);
  const colours = new Map<WaveformPaint, string>();
  for (const { rects, translucent } of paintOrder(layout)) {
    context.globalAlpha = translucent ? LOOP_ALPHA : 1;
    for (const rect of rects) {
      let colour = colours.get(rect.paint);
      if (colour === undefined) {
        colour = resolvePaint(rect.paint, style);
        colours.set(rect.paint, colour);
      }
      context.fillStyle = colour;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
  }
  context.globalAlpha = 1;
}
