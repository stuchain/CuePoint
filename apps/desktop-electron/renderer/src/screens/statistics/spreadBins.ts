/**
 * Fills the holes of a numeric spread (R4-10). The engine sends only the tempo, year or loudness
 * values that have tracks, so 139 would sit next to 170. `fillBins` puts the missing integers
 * back as empty bins and folds a long empty stretch into one break.
 *
 * Pure and presentation only: the counts and rules are still the engine's, and a filled bin has
 * no rules because nothing is behind it.
 */
import type { StatisticsBucket } from "../../api/cuepointBridge.types";

/** The most consecutive empty bins drawn as bins; one more and they become a single break. */
export const MAX_EMPTY_RUN = 8;

export const GAP_LABEL = "⋯";

/** A bucket, or a break standing for a long empty stretch of the axis (not a bucket of tracks). */
export type SpreadBin = StatisticsBucket & { gap?: boolean };

/**
 * `buckets` with every missing multiple of `step` between the first and last value added as a
 * count of 0, and a run of more than `MAX_EMPTY_RUN` of them replaced by one gap bin.
 * `labelOf` names a filled bin the way the axis names its own (default: the number).
 * Buckets whose values are not all numbers (a named axis) come back as they were.
 */
export function fillBins(
  buckets: readonly StatisticsBucket[],
  step = 1,
  labelOf: (n: number) => string = String,
): SpreadBin[] {
  if (buckets.length < 2 || step <= 0) return [...buckets];
  if (!buckets.every((b) => typeof b.value === "number" && Number.isFinite(b.value))) return [...buckets];
  const sorted = [...buckets].sort((a, b) => (a.value as number) - (b.value as number));

  const out: SpreadBin[] = [sorted[0]!];
  for (let at = 1; at < sorted.length; at += 1) {
    const from = sorted[at - 1]!.value as number;
    const to = sorted[at]!.value as number;
    // Count first: the engine's years and tempos are unbounded, so never build what is folded away.
    const missing = Math.round((to - from) / step) - 1;
    if (missing > MAX_EMPTY_RUN) {
      out.push({ gap: true, label: GAP_LABEL, value: null, count: 0, rules: null });
    } else {
      for (let k = 1; k <= missing; k += 1) {
        const n = from + k * step;
        out.push({ label: labelOf(n), value: n, count: 0, rules: null });
      }
    }
    out.push(sorted[at]!);
  }
  return out;
}
