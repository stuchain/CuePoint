/**
 * "3 tracks have no Beatport key." on the notice line (FLW-14, DEC-075), with the way to get one.
 *
 * Health's "No Beatport key" opens the Library on Key is empty, the same rule as its count. A key
 * comes from a track's confirmed match, so the note is one line and one button, "Match 185 tracks…"
 * (M503): it opens the match on exactly the tracks the list shows. How this differs from "Not
 * looked up yet" — a track can be matched and still have no key, when Beatport's record has none —
 * is in the line's hint, where it is read by someone who wants it.
 */
import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { Notice } from "../../components/Notice";
import { countNoun } from "../../format/counts";
import { MATCH_STATE } from "../../format/words";
import "./LibraryNotice.css";

interface LibraryNoKeyNoteProps {
  /** How many tracks the list shows. */
  count: number;
  /** Open the match on the tracks the list shows; absent where there is no match to open. */
  onMatch?: () => void;
}

const DIFFERENCE =
  "A track that was matched can still have no key when Beatport's record has none, so this is not the " +
  `same as a track with no confirmed match (${MATCH_STATE.notLookedUp}, ${MATCH_STATE.toCheck}, ` +
  `${MATCH_STATE.noMatch}, ${MATCH_STATE.rejected} or ${MATCH_STATE.searchFailed}).`;

export function LibraryNoKeyNote({ count, onMatch }: LibraryNoKeyNoteProps) {
  return (
    <Notice
      kind="info"
      className="library-notice"
      aria-label="Tracks with no Beatport key"
      action={
        onMatch ? (
          <Button variant="secondary" onClick={onMatch}>
            {`Match ${countNoun(count, "track")}…`}
          </Button>
        ) : undefined
      }
    >
      <p className="library-notice__line">
        <Hint text={DIFFERENCE} inline>
          <span>
            {`${countNoun(count, "track")} ${count === 1 ? "has" : "have"} no Beatport key. A key comes from a confirmed match.`}
          </span>
        </Hint>
      </p>
    </Notice>
  );
}
