/**
 * The past searches Discover has kept, newest first (DISCOVER-10, FLW-15).
 *
 * Each titled "Search of {date}", with its state, what it looked for and what
 * it found, so one can be told from the next without opening it, and with
 * **Delete this search…** on its row. Starting a search is the New search tab's
 * job, so nothing here starts one.
 */
import type { DiscoverGenre, DiscoverRun } from "../../api/cuepointBridge.types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { pluralize } from "../library/libraryFormat";
import { runStateLabel, runStateTone, runSummary, searchTitle } from "./discoverFormat";

interface RunListProps {
  runs: readonly DiscoverRun[];
  total: number;
  genres: readonly DiscoverGenre[];
  /** The search open beside the list. */
  selected: number | null;
  onSelect: (selected: number) => void;
  /** Asked to delete a search; the page confirms before it goes. */
  onDelete: (run: DiscoverRun) => void;
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
  onDelete,
  onShowMore,
  loadingMore,
}: RunListProps) {
  return (
    <nav className="discover-runs" aria-label="Past searches">
      <ul className="discover-runs__list">
        {runs.map((run) => (
          <li key={run.id} className="discover-runs__row">
            <button
              type="button"
              className={`discover-runs__item${selected === run.id ? " discover-runs__item--selected" : ""}`}
              aria-current={selected === run.id ? "page" : undefined}
              onClick={() => onSelect(run.id)}
            >
              <span className="discover-runs__when">{searchTitle(run.started_at)}</span>
              <Badge variant={BADGE[runStateTone(run)]}>{runStateLabel(run)}</Badge>
              <span className="discover-runs__what">{runSummary(run, genres)}</span>
              <span className="discover-runs__found">
                {pluralize(run.tracks_found, "track")} found
              </span>
            </button>
            <Hint text={run.running ? "A running search cannot be deleted." : undefined}>
              <Button variant="secondary" disabled={run.running} onClick={() => onDelete(run)}>
                Delete this search…
              </Button>
            </Hint>
          </li>
        ))}
      </ul>
      {runs.length < total && (
        <Button variant="secondary" loading={loadingMore} onClick={onShowMore}>
          Show older searches
        </Button>
      )}
    </nav>
  );
}
