/**
 * Which library tracks are playing now, and which have played this session (R4-6).
 *
 * Tables mark the playing row and mute the played ones, and those tables are far from the player
 * slot that knows, so the answers live here and are read through hooks, as `queuePanelState.ts`
 * does. The played set is session only (DEC-014): nothing is persisted, and every launch starts
 * with no track played.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { PlayerSnapshot } from "../../api/cuepointBridge.types";
import { selectCurrentItem } from "./playerFormat";
import { usePlayerValue } from "./playerStore";

/** The library id of the track in the player; a slice, so a reader repaints for a new track only. */
export function selectCurrentTrackId(state: PlayerSnapshot | null): number | null {
  return selectCurrentItem(state)?.trackId ?? null;
}

/** The library id of the track in the player, or null when there is none. */
export function usePlayingTrackId(): number | null {
  return usePlayerValue(selectCurrentTrackId);
}

const listeners = new Set<() => void>();

const EMPTY: ReadonlySet<number> = new Set();
let played: ReadonlySet<number> = EMPTY;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): ReadonlySet<number> {
  return played;
}

/** Note that a track has played. Marking one already marked changes nothing, and tells no one. */
export function markPlayed(trackId: number): void {
  if (played.has(trackId)) return;
  played = new Set(played).add(trackId);
  listeners.forEach((listener) => listener());
}

/** Forget what has played, so each test starts with nothing played. */
export function resetPlayedTracksForTests(): void {
  played = EMPTY;
  listeners.forEach((listener) => listener());
}

/** The tracks played this session; a new set only when it changed. */
export function usePlayedTracks(): ReadonlySet<number> {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * The two row predicates `TrackTable` takes, for rows that carry a track id. A row without one
 * (`null` or `undefined`) is neither. Stable until the playing track, the played set or
 * `getTrackId` changes, so pass a stable `getTrackId`.
 */
export function useTrackPlayMarks<Row>(getTrackId: (row: Row) => number | null | undefined): {
  isPlayingRow: (row: Row) => boolean;
  wasPlayedRow: (row: Row) => boolean;
} {
  const playingId = usePlayingTrackId();
  const playedIds = usePlayedTracks();
  const isPlayingRow = useCallback(
    (row: Row) => playingId !== null && getTrackId(row) === playingId,
    [playingId, getTrackId],
  );
  const wasPlayedRow = useCallback(
    (row: Row) => {
      const id = getTrackId(row);
      return id != null && playedIds.has(id);
    },
    [playedIds, getTrackId],
  );
  return useMemo(() => ({ isPlayingRow, wasPlayedRow }), [isPlayingRow, wasPlayedRow]);
}
