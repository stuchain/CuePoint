/**
 * The past searches Discover has kept, newest first (DISCOVER-10, FLW-15).
 *
 * Each titled "Search of {date}", with its state, what it looked for and what
 * it found, so one can be told from the next without opening it, and with
 * **Delete this dig…** in the ⋯ menu on its card. Starting a search is the New search tab's
 * job, so nothing here starts one.
 */
import { useRef, useState } from "react";

import type { DiscoverGenre, DiscoverRun } from "../../api/cuepointBridge.types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { TrackContextMenu } from "../../components/TrackContextMenu";
import { pluralize } from "../library/libraryFormat";
import {
  canContinueRun,
  runStateLabel,
  runStateTone,
  runStopLine,
  runSummary,
  searchTitle,
} from "./discoverFormat";

interface RunListProps {
  runs: readonly DiscoverRun[];
  total: number;
  genres: readonly DiscoverGenre[];
  /** The search open beside the list. */
  selected: number | null;
  onSelect: (selected: number) => void;
  /** Asked to delete a search; the page confirms before it goes. */
  onDelete: (run: DiscoverRun) => void;
  /** Asked to pick a dig that stopped partway up where it stopped. */
  onContinue: (run: DiscoverRun) => void;
  /** Why Continue is off right now (another dig, Beatport), or null. */
  continueBlocked: string | null;
  onShowMore: () => void;
  loadingMore: boolean;
}

/** One card's ⋯ button and the menu it opens: delete lives here. */
function RunMenu({ run, onDelete }: { run: DiscoverRun; onDelete: (run: DiscoverRun) => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const name = searchTitle(run.started_at);
  return (
    <>
      <Hint text={run.running ? "A running dig cannot be deleted." : undefined}>
      <button
        ref={anchor}
        type="button"
        className="discover-runs__menu"
        aria-label={run.running ? `More for ${name}. A running dig cannot be deleted.` : `More for ${name}`}
        aria-disabled={run.running ? true : undefined}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={(event) => {
          // Focusable but inert while running, so the reason is read out instead of skipped.
          if (run.running) return;
          if (menu) {
            setMenu(null);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ x: rect.left, y: rect.bottom });
        }}
      >
        <span className="discover-runs__menu-dot" aria-hidden="true" />
        <span className="discover-runs__menu-dot" aria-hidden="true" />
        <span className="discover-runs__menu-dot" aria-hidden="true" />
      </button>
      </Hint>
      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          label={`${name} actions`}
          anchor={anchor}
          onClose={() => setMenu(null)}
          items={[
            {
              id: "delete",
              label: "Delete this dig…",
              danger: true,
              onSelect: () => onDelete(run),
            },
          ]}
        />
      )}
    </>
  );
}

const BADGE = { info: "info", success: "success", warning: "warning", error: "danger" } as const;

export function RunList({
  runs,
  total,
  genres,
  selected,
  onSelect,
  onDelete,
  onContinue,
  continueBlocked,
  onShowMore,
  loadingMore,
}: RunListProps) {
  return (
    <nav className="discover-runs" aria-label="Past digs">
      <ul className="discover-runs__list">
        {runs.map((run) => (
          <li key={run.id} className="discover-runs__row">
            <button
              type="button"
              className={`discover-runs__item${selected === run.id ? " discover-runs__item--selected" : ""}`}
              aria-current={selected === run.id ? "page" : undefined}
              onClick={() => onSelect(run.id)}
            >
              <span className="discover-runs__when" data-cut-hint="">
                {searchTitle(run.started_at)}
              </span>
              <Badge variant={BADGE[runStateTone(run)]}>{runStateLabel(run)}</Badge>
              <span className="discover-runs__what" data-cut-hint="">
                {runSummary(run, genres)}
              </span>
              <span className="discover-runs__found">
                {pluralize(run.tracks_found, "track")} found
              </span>
            </button>
            {run.running && (
              <span
                className="discover-runs__progress"
                role="progressbar"
                aria-label={`${searchTitle(run.started_at)} in progress`}
              />
            )}
            {canContinueRun(run) && (
              <>
                <p className="discover-note">{runStopLine(run)}</p>
                <Hint text={continueBlocked ?? undefined}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={continueBlocked !== null}
                    onClick={() => onContinue(run)}
                  >
                    Continue
                  </Button>
                </Hint>
              </>
            )}
            <RunMenu run={run} onDelete={onDelete} />
          </li>
        ))}
      </ul>
      {runs.length < total && (
        <Button variant="secondary" loading={loadingMore} onClick={onShowMore}>
          Show older digs
        </Button>
      )}
    </nav>
  );
}
