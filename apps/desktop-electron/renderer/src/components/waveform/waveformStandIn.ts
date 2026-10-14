/**
 * What the zoomed strip draws while its 75/s detail is still being made (T4).
 *
 * The stand-in is the 1,200-column overview, a few columns a second, over a
 * window 16 s wide: drawn as repeated samples it is a row of wide blocks. These
 * are the two pure pieces that make it kind: a linearly interpolated read of the
 * overview at any fractional column, and the opacity of the cross-fade to the
 * detail once it arrives.
 */
import { reportBreadcrumb } from "../../reporting/reporting";
import { BANDS } from "./waveformLayout";

/** The cross-fade from the stand-in to the detail (ms). */
export const CROSSFADE_MS = 150;

/**
 * One band of the overview at a fractional column `position`, interpolated
 * linearly between the two columns it falls between. Column `i` is at its
 * middle, `i + 0.5`, so a position there reads that column exactly; before the
 * first middle and after the last, the end column is held. Not a number is 0.
 */
export function smoothedPeak(data: Uint8Array, band: number, sourceColumns: number, position: number): number {
  if (sourceColumns <= 0 || !Number.isFinite(position)) return 0;
  const at = Math.min(sourceColumns - 1, Math.max(0, position - 0.5));
  const low = Math.floor(at);
  const high = Math.min(sourceColumns - 1, low + 1);
  const a = data[low * BANDS + band] ?? 0;
  const b = data[high * BANDS + band] ?? 0;
  return a + (b - a) * (at - low);
}

/**
 * The detail's opacity `elapsedMs` into a cross-fade of `durationMs`: 0 as it
 * starts, 1 from the end on. A fade of no length (reduced motion) is over.
 */
export function crossfadeAlpha(elapsedMs: number, durationMs: number): number {
  if (!(durationMs > 0)) return 1;
  if (!(elapsedMs > 0)) return 0;
  return Math.min(1, elapsedMs / durationMs);
}

/**
 * Note that the stand-in was drawn for `ms` before the detail replaced it
 * (`replaced`) or the track changed first (`left`): a profiler mark and a
 * breadcrumb in the page timing's manner, a duration and an outcome only, with
 * no track, title or path. Never throws.
 */
export function noteStandIn(ms: number, outcome: "replaced" | "left"): void {
  const whole = Math.max(0, Math.round(ms));
  try {
    performance.mark(`cp-waveform:standin:${outcome}`, { detail: { ms: whole } });
  } catch {
    // A mark is only for the profiler.
  }
  reportBreadcrumb("waveform", `stand-in drawn ${whole} ms, ${outcome}`);
}
