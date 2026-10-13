/**
 * "3 tracks have no Beatport key." on the notice line (FLW-14, DEC-075).
 *
 * Health's "No Beatport key" opens the Library on Key is empty, the same rule
 * as its count. The note says what the list is; matching them is the bar's
 * Beatport ▸ Match tracks… once they are selected. It also says how this differs from "Not matched": a track
 * can be matched and still have no key, when Beatport's record has none.
 */
import "./LibraryNotice.css";

interface LibraryNoKeyNoteProps {
  /** How many tracks the list shows. */
  count: number;
}

export function LibraryNoKeyNote({ count }: LibraryNoKeyNoteProps) {
  return (
    <div className="library-notice" role="status" aria-label="Tracks with no Beatport key">
      <p className="library-notice__line">
        {`${count.toLocaleString()} ${count === 1 ? "track has" : "tracks have"} no Beatport key.`}{" "}
        A key comes from a track&apos;s accepted match. A track that was matched can still have
        none when Beatport&apos;s record has none, so this is not the same as Not matched.
      </p>
    </div>
  );
}
