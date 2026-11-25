/**
 * The crowd's energy from the waveform, for when no live reading is coming (the player could not
 * add its meter, or readings stopped for over a second: `LEVELS_STALE_MS`, which the rules apply). Pure.
 */

/** Without a reading for this long (ms) the waveform stands in. */
export const LEVELS_STALE_MS = 1000;

/** Bytes per waveform column: full, low, mid, high. */
const BANDS = 4;

/**
 * The full band of the column at the play position, 0..1; null when there is nothing to read.
 * `data` is `width × 4` bytes spread over the track's duration.
 */
export function waveformEnergyAt(
  data: Uint8Array | null | undefined,
  positionSec: number | null | undefined,
  durationSec: number | null | undefined,
): number | null {
  if (!data || positionSec == null || durationSec == null || !(durationSec > 0)) return null;
  const columns = Math.floor(data.length / BANDS);
  if (columns <= 0) return null;
  const column = Math.min(columns - 1, Math.max(0, Math.floor((positionSec / durationSec) * columns)));
  return Math.min(1, Math.max(0, data[column * BANDS] / 255));
}
