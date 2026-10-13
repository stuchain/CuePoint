/**
 * What the buttons under a track's title do (FLW-9).
 *
 * Play, Play next and Add to queue are the selection bar's, for the track in
 * hand or for every track selected; they say what they did the same way
 * (`queuedMessage`), because Play next and Add to queue never interrupt and
 * would otherwise look like nothing happened.
 */
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
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
