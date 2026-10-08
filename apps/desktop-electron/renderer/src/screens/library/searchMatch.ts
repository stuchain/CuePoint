/**
 * What a search row says it matched on (FLW-5).
 *
 * Typing "8A" or "124" finds tracks by key or by tempo as well as by words, and
 * a row found that way would be a mystery without a note: "Key 8A", "124 BPM".
 * The engine says which (`matched_on`); the words come from the row's own
 * resolved key and BPM, so the note shows the value the table shows.
 */
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";

type Matched = Pick<LibraryTrackRow, "effective_key" | "effective_bpm" | "matched_on">;

/** A BPM as a person says it: 124, 123.6 — never 123.60000000000001. */
function tempo(bpm: number): string {
  return String(Math.round(bpm * 10) / 10);
}

/** "Key 8A" or "124 BPM" for a row found by its key or tempo; otherwise null. */
export function matchedLabel(row: Matched): string | null {
  if (row.matched_on === "key" && row.effective_key) return `Key ${row.effective_key}`;
  if (row.matched_on === "bpm" && row.effective_bpm != null) {
    return `${tempo(row.effective_bpm)} BPM`;
  }
  return null;
}
