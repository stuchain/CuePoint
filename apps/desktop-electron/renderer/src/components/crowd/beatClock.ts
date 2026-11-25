/**
 * Where a position falls on the beat (the crowd's clock).
 *
 * Pure: the grid is the track's own `BeatGridMarker[]` from the waveform read. The last marker at
 * or before the position sets the tempo; before the first marker the first one's tempo is
 * extrapolated backwards. With no grid the track's BPM counts from 0, and with no BPM either it is
 * 120. `beat` is a whole index and `phase` is how far through that beat the position is, 0 up to 1.
 * Each marker is snapped to its own beat of the bar (`beat % 4 === marker.beat - 1`), so a grid that
 * restarts the bar mid-track keeps the downbeats where Rekordbox put them. The sorted markers and
 * their beat counts are worked out once per grid array.
 */
import type { BeatGridMarker } from "../../api/cuepointBridge.types";

export const DEFAULT_BPM = 120;

export interface BeatPosition {
  beat: number;
  phase: number;
  /** One beat at the tempo in force (ms). */
  beatMs: number;
}

interface Prepared {
  starts: number[];
  /** Beats counted at each marker. */
  bases: number[];
  /** One beat at each marker's tempo (ms). */
  lengths: number[];
}

const prepared = new WeakMap<readonly BeatGridMarker[], Map<number, Prepared>>();

function usableBpm(bpm: number | null | undefined): number | null {
  return typeof bpm === "number" && Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

function prepare(grid: readonly BeatGridMarker[], fallback: number): Prepared {
  const byFallback = prepared.get(grid) ?? new Map<number, Prepared>();
  prepared.set(grid, byFallback);
  const known = byFallback.get(fallback);
  if (known) return known;

  const markers = grid.filter((m) => Number.isFinite(m.start_ms)).sort((a, b) => a.start_ms - b.start_ms);
  const starts: number[] = [];
  const bases: number[] = [];
  const lengths: number[] = [];
  markers.forEach((marker, i) => {
    let base = 0;
    if (i > 0) base = bases[i - 1] + Math.round((marker.start_ms - starts[i - 1]) / lengths[i - 1]);
    const wanted = marker.beat !== null && marker.beat >= 1 && marker.beat <= 4 ? marker.beat - 1 : null;
    if (wanted !== null) {
      let delta = (((wanted - base) % 4) + 4) % 4;
      if (delta > 2) delta -= 4;
      base += delta;
    }
    starts.push(marker.start_ms);
    bases.push(base);
    lengths.push(60_000 / (usableBpm(marker.bpm) ?? fallback));
  });
  const result = { starts, bases, lengths };
  byFallback.set(fallback, result);
  return result;
}

function split(beats: number, beatMs: number): BeatPosition {
  const beat = Math.floor(beats);
  return { beat, phase: beats - beat, beatMs };
}

export function beatAt(
  positionSec: number,
  grid: readonly BeatGridMarker[] | null | undefined,
  fallbackBpm: number | null | undefined,
): BeatPosition {
  const fallback = usableBpm(fallbackBpm) ?? DEFAULT_BPM;
  const positionMs = positionSec * 1000;
  const { starts, bases, lengths } = grid && grid.length > 0 ? prepare(grid, fallback) : { starts: [], bases: [], lengths: [] };
  if (starts.length === 0) return split((positionMs / 60_000) * fallback, 60_000 / fallback);

  // The last marker at or before the position (the first when it is before them all).
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= positionMs) low = mid;
    else high = mid - 1;
  }
  return split(bases[low] + (positionMs - starts[low]) / lengths[low], lengths[low]);
}
