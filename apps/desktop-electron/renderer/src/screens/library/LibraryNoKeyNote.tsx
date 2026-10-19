/**
 * "3 tracks have no Beatport key." on the notice line (FLW-14, DEC-075).
 *
 * Health's "No Beatport key" opens the Library on Key is empty, the same rule
 * as its count. The note says what the list is; matching them is the bar's
 * Beatport > Match on Beatport… once they are selected. It also says how this differs from
 * "Not looked up yet": a track can be matched and still have no key, when Beatport's record has none.
 */
import { Notice } from "../../components/Notice";
import { countNoun } from "../../format/counts";
import { MATCH_STATE } from "../../format/words";
import "./LibraryNotice.css";

interface LibraryNoKeyNoteProps {
  /** How many tracks the list shows. */
  count: number;
}

export function LibraryNoKeyNote({ count }: LibraryNoKeyNoteProps) {
  return (
    <Notice kind="info" className="library-notice" aria-label="Tracks with no Beatport key">
      <p className="library-notice__line">
        {`${countNoun(count, "track")} ${count === 1 ? "has" : "have"} no Beatport key.`} A key comes from a track&apos;s
        confirmed match. A track that was matched can still have none when Beatport&apos;s record
        has none, so this is not the same as a track with no confirmed match ({MATCH_STATE.notLookedUp},{" "}
        {MATCH_STATE.toCheck}, {MATCH_STATE.noMatch}, {MATCH_STATE.rejected} or{" "}
        {MATCH_STATE.searchFailed}).
      </p>
    </Notice>
  );
}
