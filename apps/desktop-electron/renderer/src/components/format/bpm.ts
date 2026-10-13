/**
 * The one way a BPM is written: rounded to one decimal, and whole when whole.
 *
 * Every screen goes through here so the same track never reads "128.0" in one
 * place and "128" in another. The unit word is the caller's. Edit fields and
 * anything written to a file keep the exact value instead.
 */
export function formatBpm(bpm: number | null | undefined): string {
  if (bpm === null || bpm === undefined || !Number.isFinite(bpm) || bpm <= 0) return "";
  // Rounded on the decimal reading, not the binary one: 127.35 is a .4, not a .3.
  return String(Math.round(bpm * 10 + 1e-9) / 10);
}

/** A BPM range: "120–128", "from 120", "to 128", or "" with neither end. */
export function formatBpmRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  const low = formatBpm(min);
  const high = formatBpm(max);
  if (low && high) return low === high ? low : `${low}–${high}`;
  if (low) return `from ${low}`;
  if (high) return `to ${high}`;
  return "";
}
