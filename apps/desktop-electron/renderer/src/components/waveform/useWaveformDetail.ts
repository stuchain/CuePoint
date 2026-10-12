/**
 * One track's zoomed waveform (T4), from the cache every view shares: shown
 * until the view stops showing it, re-read as answers arrive.
 */
import { useEffect, useReducer } from "react";

import { waveformDetailCache, type DetailEntry, type WaveformDetailCache } from "./waveformDetailCache";

/** The track's detail answer, or null when no track is shown. */
export function useWaveformDetail(
  trackId: number | null,
  cache: WaveformDetailCache = waveformDetailCache,
): DetailEntry | null {
  const [, changed] = useReducer((n: number) => n + 1, 0);
  useEffect(() => cache.subscribe(changed), [cache]);
  useEffect(() => (trackId === null ? undefined : cache.show(trackId)), [cache, trackId]);
  return trackId === null ? null : cache.read(trackId);
}
