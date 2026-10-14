/**
 * Mounts the prepare-ahead for the zoomed strip's waveforms (T4): the selected
 * library track and the next one in the queue (`waveformPrefetch.ts` decides
 * what is asked for and when; the cache does the asking).
 *
 * The selection is `selectedTrack`'s, a library id or nothing (a Discover track
 * is a string and has no waveform). The next track is read from the player's
 * queue window at the position after the current one (play order, so shuffle
 * counts), whenever the queue's length, current entry or order changes, which is
 * also when a track is queued.
 */
import { useEffect, useRef } from "react";

import type { PlayerSnapshot } from "../../api/cuepointBridge.types";
import { selectQueueRevision } from "../player/playerFormat";
import { selectCurrentTrackId } from "../player/playedTracks";
import { usePlayerValue } from "../player/playerStore";
import { useSelectedTrack } from "../shell/selectedTrack";
import { waveformDetailCache } from "./waveformDetailCache";
import { WaveformPrefetcher, type DetailPrefetcherCache } from "./waveformPrefetch";

/**
 * Where the track after the current one sits in the queue: 0 when nothing plays
 * yet, and 0 again after the last track when the queue repeats all. (A queue
 * reordered in place changes neither its length nor what plays, so the snapshot
 * gives no signal for it; the next read happens on the next queue change.)
 */
function selectNextPosition(state: PlayerSnapshot | null): number | null {
  if (!state) return null;
  const { currentIndex, length, repeat } = state.queue;
  if (repeat === "all" && length > 0 && currentIndex >= length - 1 && currentIndex >= 0) return 0;
  return Math.max(0, currentIndex + 1);
}

interface PrefetchOptions {
  /** False when the strip is off (Settings, Waveforms): nothing is made ahead. */
  enabled?: boolean;
}

export function useWaveformPrefetch(
  { enabled = true }: PrefetchOptions = {},
  cache: DetailPrefetcherCache = waveformDetailCache,
): void {
  const prefetcher = useRef<WaveformPrefetcher | null>(null);
  if (prefetcher.current === null) prefetcher.current = new WaveformPrefetcher(cache);

  const selected = useSelectedTrack();
  const playing = usePlayerValue(selectCurrentTrackId);
  const revision = usePlayerValue(selectQueueRevision);
  const nextPosition = usePlayerValue(selectNextPosition);
  const selectedId = enabled && typeof selected?.id === "number" ? selected.id : null;

  useEffect(
    () => () => {
      // Strict mode runs effects twice: a disposed one is replaced by the next use.
      prefetcher.current?.dispose();
      prefetcher.current = null;
    },
    [],
  );

  useEffect(() => {
    if (prefetcher.current === null) prefetcher.current = new WaveformPrefetcher(cache);
    prefetcher.current.setSelected(selectedId);
  }, [cache, selectedId]);

  useEffect(() => {
    if (prefetcher.current === null) prefetcher.current = new WaveformPrefetcher(cache);
    prefetcher.current.setPlaying(playing);
  }, [cache, playing]);

  useEffect(() => {
    if (!enabled || revision === null || nextPosition === null) {
      prefetcher.current?.setNext(null);
      return undefined;
    }
    const player = window.cuepoint?.player;
    if (!player?.queueWindow) return undefined;
    let stale = false;
    void player
      .queueWindow(nextPosition, 1)
      .then((page) => {
        if (stale) return;
        const trackId = page.items[0]?.trackId ?? null;
        if (prefetcher.current === null) prefetcher.current = new WaveformPrefetcher(cache);
        prefetcher.current.setNext(trackId);
      })
      .catch(() => {
        // The next track is a guess; none is as good as one.
      });
    return () => {
      stale = true;
    };
  }, [cache, enabled, nextPosition, revision]);
}
