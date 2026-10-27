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
import { countNoun, formatCount } from "../../format/counts";

export function setScopeNote(
  set: Pick<CollectionNode, "name" | "entry_count" | "track_count">,
): string {
  // One short line (M407): the name is in the title above, the link to Prepare follows the words.
  if (set.entry_count === set.track_count) return "A Set: each track once, in play order.";
  // M427: counted in tracks, as the Set plays them: "A Set: 32 tracks, 2 played twice, in play order."
  const again = set.entry_count - set.track_count;
  return `A Set: ${countNoun(set.entry_count, "track")}, ${formatCount(again)} played twice, in play order.`;
}
