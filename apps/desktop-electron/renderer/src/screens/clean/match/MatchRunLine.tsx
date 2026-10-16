/**
 * The note at the top of Clean for a run that ended finding nothing: a red note with the count and
 * a way to see them, because a search that found nothing for every track usually failed. The page
 * decides when it shows; this only draws. Progress while a match runs is in the playlist's row and
 * the status strip.
 */
import { Button } from "../../../components/Button";
import { formatCount } from "../../../format/counts";
import { nothingFoundLine, nothingFoundCount, type NothingFound } from "./matchDone";

interface NothingFoundNoteProps {
  name: string;
  found: NothingFound;
  onSee: () => void;
  onDismiss: () => void;
}

export function NothingFoundNote({ name, found, onSee, onDismiss }: NothingFoundNoteProps) {
  const count = nothingFoundCount(found);
  return (
    <div className="match-nothing" role="alert">
      <strong className="match-nothing__headline">{nothingFoundLine(name, found)}</strong>
      <span className="match-nothing__why">
        {found.failed > 0
          ? "Beatport could not be reached or turned the search away, so nothing is known about those tracks. Match again usually fixes it."
          : "This usually means the search failed, not that the tracks aren't on Beatport."}
      </span>
      <Button size="sm" onClick={onSee}>{`See the ${formatCount(count)} ›`}</Button>
      <Button size="sm" variant="secondary" aria-label="Dismiss" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
