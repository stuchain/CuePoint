/**
 * A Beatport track's key as the Camelot code the app uses (DEC-201, PAGES-08).
 *
 * The engine sends a Beatport row's key in classic notation ("Am", "F#m",
 * "Gb") because that is how it keeps the catalog. The app shows Camelot ("8A")
 * and the header's wheel lights it, so a selected result row hands the wheel
 * this reading, which is the shared parser in `components/wheel/keyColour.ts`
 * (a spelling it cannot read is no key, never a guess).
 */
import type { BeatportTrackRow } from "../../api/cuepointBridge.types";
import { camelotOf } from "../../components/wheel/keyColour";

export { camelotOf };

/** A Beatport row's key as Camelot, or null (Beatport's own key; never Rekordbox's). */
export function beatportRowKey(row: Pick<BeatportTrackRow, "key">): string | null {
  return camelotOf(row.key);
}
