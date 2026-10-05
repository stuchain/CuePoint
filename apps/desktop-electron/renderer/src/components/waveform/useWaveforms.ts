/**
 * The waveforms a view shows (WAVE-05), from the cache every view shares.
 *
 * A view names the tracks it shows and the width it draws at; this asks the
 * cache for them, re-reads as answers arrive, and tells the cache when the
 * view stops showing them. Batching, the cache's bound, the refresh of
 * waiting tracks and its emptying are all `waveformCache.ts`'s.
 */
import { useEffect, useMemo, useReducer } from "react";

import { waveformCache, type WaveformCache, type WaveformEntry } from "./waveformCache";

export interface UseWaveformsOptions {
  /** Ask for each track's cues and grid too. */
  marks?: boolean;
  /** The cache to read; the app's own unless a test gives one. */
  cache?: WaveformCache;
}

/** Each track's answer at `width`, keyed by id; loading until it arrives. */
export function useWaveforms(
  trackIds: readonly number[],
  width: number,
  { marks = false, cache = waveformCache }: UseWaveformsOptions = {},
): ReadonlyMap<number, WaveformEntry> {
  const [version, changed] = useReducer((n: number) => n + 1, 0);
  // A new array of the same ids is the same request.
  const idsKey = trackIds.join(",");
  const ids = useMemo(
    () => (idsKey ? idsKey.split(",").map(Number) : []),
    [idsKey],
  );
  const valid = width >= 16 && width <= 1200 && Number.isInteger(width);

  useEffect(() => cache.subscribe(changed), [cache]);
  useEffect(() => {
    if (!valid || ids.length === 0) return undefined;
    return cache.show(ids, { width, marks });
  }, [cache, ids, marks, valid, width]);

  return useMemo(() => {
    const answers = new Map<number, WaveformEntry>();
    for (const trackId of ids) {
      answers.set(trackId, valid ? cache.read(trackId, { width, marks }) : { kind: "loading" });
    }
    return answers;
    // `version` is the signal that the cache answered.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, ids, marks, valid, version, width]);
}

/** One track's answer, or null when no track is shown. */
export function useWaveform(
  trackId: number | null,
  width: number,
  options: UseWaveformsOptions = {},
): WaveformEntry | null {
  const ids = useMemo(() => (trackId === null ? [] : [trackId]), [trackId]);
  const answers = useWaveforms(ids, width, options);
  return trackId === null ? null : (answers.get(trackId) ?? { kind: "loading" });
}
