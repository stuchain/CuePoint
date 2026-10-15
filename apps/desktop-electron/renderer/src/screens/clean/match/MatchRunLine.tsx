/**
 * The lines at the top of Clean that say what the matching is doing.
 *
 * **While a match runs** ("Matching hJ · bar · 11 of 24 · about 2 minutes left · Stop"), on every
 * Clean tab and again when the person comes back to the page: it is read from the engine's running
 * job, not from what this page remembers. **When a run ended finding nothing**, a red note with the
 * count and a way to see them: a search that found nothing for every track usually failed.
 * The page decides when each shows; these only draw.
 */
import { Button } from "../../../components/Button";
import { aboutDuration } from "../../../components/shell/useActiveJob";
import { nothingFoundLine, nothingFoundCount, type NothingFound } from "./matchDone";

interface MatchRunningLineProps {
  /** What is being matched ("hJ", "Whole library"); null when it is not known. */
  name: string | null;
  progress: { done: number; total: number } | null;
  /** About how long is left, in seconds, once it can be said. */
  secondsLeft: number | null;
  /** Stop the match; null until the engine's job is known. */
  onStop: (() => void) | null;
}

export function MatchRunningLine({ name, progress, secondsLeft, onStop }: MatchRunningLineProps) {
  const words = progress
    ? name
      ? `Matching ${name}`
      : "Matching"
    : name
      ? `Matching ${name}…`
      : "Matching…";
  return (
    <div className="match-run-line" role="region" aria-label="Matching">
      <strong className="match-run-line__name">{words}</strong>
      {progress && (
        <>
          <progress
            className="clean-progress"
            aria-label="Matching progress"
            value={progress.done}
            max={progress.total}
          />
          <span className="match-run-line__count">
            {progress.done.toLocaleString()} of {progress.total.toLocaleString()}
            {secondsLeft !== null && ` · ${aboutDuration(secondsLeft)} left`}
          </span>
        </>
      )}
      {onStop && (
        <Button size="sm" variant="secondary" aria-label="Stop matching" onClick={onStop}>
          Stop
        </Button>
      )}
    </div>
  );
}

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
      <Button size="sm" onClick={onSee}>{`See the ${count.toLocaleString()} ›`}</Button>
      <Button size="sm" variant="secondary" aria-label="Dismiss" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
