/**
 * "3 tracks have no Beatport key." on the notice line (FLW-14, DEC-075).
 *
 * Health's "No Beatport key" opens the Library on Key is empty, the same rule
 * as its count. The note says what the list is and offers **Match tracks…** with
 * those tracks. It also says how this differs from "Not looked up yet": a track
 * can be matched and still have no key, when Beatport's record has none.
 */
import { Button } from "../../components";
import "./LibraryNotice.css";

interface LibraryNoKeyNoteProps {
  /** How many tracks the list shows. */
  count: number;
  /** Open matching with the tracks in the list. */
  onMatch?: () => void;
}

export function LibraryNoKeyNote({ count, onMatch }: LibraryNoKeyNoteProps) {
  return (
    <div className="library-notice" role="status" aria-label="Tracks with no Beatport key">
      <p className="library-notice__line">
        {`${count.toLocaleString()} ${count === 1 ? "track has" : "tracks have"} no Beatport key.`}{" "}
        A key comes from a track&apos;s accepted match. A track that was matched can still have
        none when Beatport&apos;s record has none, so this is not the same as Not looked up yet.
      </p>
      {onMatch && (
        <div className="library-notice__actions">
          <Button variant="primary" onClick={onMatch}>
            Match tracks…
          </Button>
        </div>
      )}
    </div>
  );
}
