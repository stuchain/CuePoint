/**
 * What the Library says above a Set's tracks (PREP-09, fact 3, DEC-104).
 *
 * The Library scopes a Set as it does a Collection: the browse query, which
 * lists each track once, at the first place it plays. A Set is a running
 * order and may play a track twice, so the table is not the Set, and the note
 * says so plainly — with the numbers when they differ, because "12 entries,
 * 11 rows" is the thing a reader would otherwise count and wonder about.
 */
import type { CollectionNode } from "../../api/cuepointBridge.types";

export function setScopeNote(
  set: Pick<CollectionNode, "name" | "entry_count" | "track_count">,
): string {
  const name = `“${set.name}”`;
  if (set.entry_count === set.track_count) {
    return `${name} is a Set. The table lists each of its tracks once, in the order they first play.`;
  }
  const entries = `${set.entry_count.toLocaleString()} ${set.entry_count === 1 ? "entry" : "entries"}`;
  const tracks = `${set.track_count.toLocaleString()} ${set.track_count === 1 ? "track" : "tracks"}`;
  return `${name} is a Set of ${entries}. The table lists each of its ${tracks} once, in the order they first play.`;
}
