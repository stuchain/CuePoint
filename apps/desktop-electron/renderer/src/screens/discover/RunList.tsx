/**
 * The runs Discover has kept, newest first (DISCOVER-10, DEC-091).
 *
 * Each with its date, what it looked for, how it ended and what it found, so a
 * run can be told from the next without opening it. "New run" sits above them:
 * it is the other thing this list is for.
 */
import type { DiscoverGenre, DiscoverRun } from "../../api/cuepointBridge.types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { pluralize } from "../library/libraryFormat";
import {
  formatWhen,
  runStateLabel,
  runStateTone,
  runSummary,
} from "./discoverFormat";

export interface RunListProps {
  runs: readonly DiscoverRun[];
  total: number;
  genres: readonly DiscoverGenre[];
  /** The run open beside the list, or "new" for the New run panel. */
  selected: number | "new" | null;
  onSelect: (selected: number | "new") => void;
  onShowMore: () => void;
  loadingMore: boolean;
}

const BADGE = { info: "info", success: "success", warning: "warning", error: "danger" } as const;

export function RunList({
  runs,
  total,
  genres,
  selected,
  onSelect,
  onShowMore,
  loadingMore,
}: RunListProps) {
  return (
    <nav className="discover-runs" aria-label="Runs">
      <Button
        className="discover-runs__new"
        variant={selected === "new" ? "primary" : "secondary"}
        aria-current={selected === "new" ? "page" : undefined}
        onClick={() => onSelect("new")}
      >
        New run
      </Button>
      {runs.length === 0 ? (
        <p className="discover-note">No runs yet. Start one to see what is new from your artists and labels.</p>
      ) : (
        <ul className="discover-runs__list">
          {runs.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                className={`discover-runs__item${selected === run.id ? " discover-runs__item--selected" : ""}`}
                aria-current={selected === run.id ? "page" : undefined}
                onClick={() => onSelect(run.id)}
              >
                <span className="discover-runs__when">{formatWhen(run.started_at)}</span>
                <Badge variant={BADGE[runStateTone(run)]}>{runStateLabel(run)}</Badge>
                <span className="discover-runs__what">{runSummary(run, genres)}</span>
                <span className="discover-runs__found">
                  {pluralize(run.tracks_found, "track")} found
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {runs.length < total && (
        <Button variant="secondary" loading={loadingMore} onClick={onShowMore}>
          Show older runs
        </Button>
      )}
    </nav>
  );
}
