/**
 * What the buttons under a track's title do (FLW-9).
 *
 * Play, Play next and Add to queue are the selection bar's, for the track in
 * hand or for every track selected; they say what they did the same way
 * (`queuedMessage`), because Play next and Add to queue never interrupt and
 * would otherwise look like nothing happened.
 */
import type { BatchSelection, LibraryTrackRow } from "../../api/cuepointBridge.types";
import type { CleanTracks } from "../clean/cleanTracks";
import { queuedMessage, toQueueItem } from "./useLibraryPlayback";

export type QueueAction = "play" | "next" | "end";

/** Which actions this window can do at all: the player bridge may be absent. */
export function availableQueueActions(): Record<QueueAction, boolean> {
  const player = window.cuepoint?.player;
  return {
    play: Boolean(player?.playQueue),
    next: Boolean(player?.playNext),
    end: Boolean(player?.addToQueue),
  };
}

/** Run one action on these rows. Resolves to a sentence for the person, or null. */
export async function runQueueAction(
  action: QueueAction,
  rows: readonly LibraryTrackRow[],
): Promise<{ message: string; failed: boolean } | null> {
  const player = window.cuepoint?.player;
  if (!player || rows.length === 0) return null;
  const items = rows.map(toQueueItem);
  if (action === "play") {
    const result = await player.playQueue?.(items, 0);
    return result && !result.ok ? { message: result.error, failed: true } : null;
  }
  if (action === "next") {
    await player.playNext?.(items);
    return { message: queuedMessage(rows.length, "next"), failed: false };
  }
  await player.addToQueue?.(items);
  return { message: queuedMessage(rows.length, "end"), failed: false };
}

/**
 * The selection as Clean's Fix values takes it (INS-11): ids as ids, a
 * described selection as its question with the count it had. A described one
 * with exceptions has no such spelling, so Track details does not offer to
 * edit it rather than edit more tracks than are selected.
 */
export function cleanTracksOf(selection: BatchSelection, count: number): CleanTracks | null {
  if (selection.track_ids) return selection.track_ids.length > 0 ? { ids: [...selection.track_ids] } : null;
  if (selection.query && !selection.exclude_track_ids?.length) return { query: selection.query, count };
  return null;
}
