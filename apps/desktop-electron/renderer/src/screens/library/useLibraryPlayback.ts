import { useCallback } from "react";
import type { LibraryTrackRow, QueueItemInput } from "../../api/cuepointBridge.types";
import type { LibraryQuery } from "./libraryQuery";
import { browseParams } from "./libraryQuery";

/**
 * Playing from the Library table (PLAYER-09, DEC-012, DEC-013).
 *
 * Three actions, and the difference between them is what each one means by
 * "the queue":
 *
 * - **Play** on a single row is DEC-012: the row plays and *the current view*
 *   becomes the queue. Not the visible rows — the view is a query, and the
 *   table holds a window of it (DEC-040) — so main resolves it (PLAYER-05).
 * - **Play** on a selection replaces the queue with the selection, because
 *   someone who picked five tracks and chose Play meant those five.
 * - **Play Next** and **Add to Queue** (DEC-013) never interrupt; they insert
 *   after the current track or at the end.
 *
 * Selections are turned into rows by the selection's own `gatherRows`, which
 * pages the view and keeps its order — so a selection made with Ctrl+A across
 * rows the table never loaded still queues the right tracks in the right
 * order.
 */

/** The most tracks one action will queue, matching the queue's own cap. */
export const QUEUE_ACTION_LIMIT = 50_000;

export function toQueueItem(row: LibraryTrackRow): QueueItemInput {
  return {
    trackId: row.id ?? null,
    filePath: row.file_path,
    title: row.title,
    artist: row.artist,
    key: row.key ?? null,
    bpm: row.bpm ?? null,
    durationSeconds: row.duration_seconds ?? null,
  };
}

export interface LibraryPlaybackActions {
  /** DEC-012: play this row, with the whole view behind it. */
  playRow: (index: number) => Promise<void>;
  /** Replace the queue with these rows and play the first. */
  playRows: (rows: LibraryTrackRow[]) => Promise<void>;
  playNext: (rows: LibraryTrackRow[]) => Promise<void>;
  addToQueue: (rows: LibraryTrackRow[]) => Promise<void>;
  /** True when there is a player to talk to at all. */
  available: boolean;
}

export interface LibraryPlaybackOptions {
  query: LibraryQuery;
  /** Reports what happened, so a truncated or failed action is not silent. */
  onMessage?: (message: string) => void;
}

export function useLibraryPlayback({
  query,
  onMessage,
}: LibraryPlaybackOptions): LibraryPlaybackActions {
  const playRow = useCallback(
    async (index: number) => {
      const player = window.cuepoint?.player;
      if (!player?.playView) return;
      // The view, not the loaded rows: the table holds a window of a much
      // larger answer, and DEC-012 queues the whole thing.
      const params = browseParams(query, 0, 0);
      const result = await player.playView(params, index);
      if (!result.ok) {
        onMessage?.(result.error);
        return;
      }
      // Only when something was actually left out (PLAYER-05).
      if (result.message) onMessage?.(result.message);
    },
    [onMessage, query],
  );

  const playRows = useCallback(
    async (rows: LibraryTrackRow[]) => {
      const player = window.cuepoint?.player;
      if (!player?.playQueue || rows.length === 0) return;
      const result = await player.playQueue(rows.map(toQueueItem), 0);
      if (!result.ok) onMessage?.(result.error);
    },
    [onMessage],
  );

  const playNext = useCallback(
    async (rows: LibraryTrackRow[]) => {
      const player = window.cuepoint?.player;
      if (!player?.playNext || rows.length === 0) return;
      await player.playNext(rows.map(toQueueItem));
      onMessage?.(queuedMessage(rows.length, "next"));
    },
    [onMessage],
  );

  const addToQueue = useCallback(
    async (rows: LibraryTrackRow[]) => {
      const player = window.cuepoint?.player;
      if (!player?.addToQueue || rows.length === 0) return;
      await player.addToQueue(rows.map(toQueueItem));
      onMessage?.(queuedMessage(rows.length, "end"));
    },
    [onMessage],
  );

  return {
    playRow,
    playRows,
    playNext,
    addToQueue,
    available: Boolean(window.cuepoint?.player),
  };
}

/**
 * What an append says afterwards.
 *
 * DEC-013 made these first-class actions that deliberately do *not* interrupt,
 * which means nothing visibly happens unless the queue panel is open — so they
 * say what they did.
 */
export function queuedMessage(count: number, where: "next" | "end"): string {
  const tracks = count === 1 ? "1 track" : `${count.toLocaleString()} tracks`;
  return where === "next" ? `${tracks} queued to play next` : `${tracks} added to the queue`;
}
