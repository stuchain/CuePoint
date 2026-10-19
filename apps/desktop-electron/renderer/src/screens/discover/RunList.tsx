/**
 * The past searches Discover has kept, newest first (DISCOVER-10, FLW-15).
 *
 * Each titled "Dig of {date}", with its state, what it looked for and what
 * it found, so one can be told from the next without opening it, and with
 * **Delete this dig…** in the ⋯ menu on its card, which a right-click on the card opens too
 * (C83). Starting a search is the New search tab's job, so nothing here starts one.
 */
import { useRef, useState } from "react";

import type { DiscoverGenre, DiscoverRun } from "../../api/cuepointBridge.types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { Loading } from "../../components/Loading";
import { ShowMore } from "../../components/ShowMore";
import { TrackContextMenu } from "../../components/TrackContextMenu";
import { countNoun, formatCount } from "../../format/counts";
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
  /** Asked to show every dig, not only the newest page of them. */
  /** The most digs the engine keeps: past it there is nothing more to show. */
  max: number;
  onShowMore: () => void;
  loadingMore: boolean;
}

const BADGE = { info: "info", success: "success", warning: "warning", error: "danger" } as const;

/** Why a running dig keeps its menu shut. */
const RUNNING_REASON = "A running dig cannot be deleted";

/**
 * One dig's card: the card itself, its ⋯ button and the menu that button and a right-click on the
 * card both open. Delete lives in that menu.
 */
function RunRow({
  run,
  genres,
  selected,
  onSelect,
  onDelete,
  onContinue,
  continueBlocked,
}: {
  run: DiscoverRun;
  genres: readonly DiscoverGenre[];
  selected: boolean;
  onSelect: () => void;
  onDelete: (run: DiscoverRun) => void;
  onContinue: (run: DiscoverRun) => void;
  continueBlocked: string | null;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const name = searchTitle(run.started_at);
  return (
    <li
      className="discover-runs__row"
      onContextMenu={(event) => {
        event.preventDefault();
        // The same as the ⋯ button: a running dig has nothing to offer yet.
        if (!run.running) setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <button
        type="button"
        className={`discover-runs__item${selected ? " discover-runs__item--selected" : ""}`}
        aria-current={selected ? "page" : undefined}
        onClick={onSelect}
      >
        <span className="discover-runs__when" data-cut-hint="">
          {name}
        </span>
        <Badge variant={BADGE[runStateTone(run)]}>{runStateLabel(run)}</Badge>
        <span className="discover-runs__what" data-cut-hint="">
          {runSummary(run, genres)}
        </span>
        <span className="discover-runs__found">{countNoun(run.tracks_found, "track")} found</span>
      </button>
      {run.running && <progress className="cp-progress discover-runs__progress" aria-label={`${name} in progress`} />}
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
      <Hint text={run.running ? RUNNING_REASON : undefined}>
        <button
          ref={anchor}
          type="button"
          className="discover-runs__menu"
          aria-label={run.running ? `More for ${name}. ${RUNNING_REASON}` : `More for ${name}`}
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
    </li>
  );
}

export function RunList({
  runs,
  total,
  genres,
  selected,
  onSelect,
  onDelete,
  onContinue,
  continueBlocked,
  max,
  onShowMore,
  loadingMore,
}: RunListProps) {
  return (
    <nav className="discover-runs" aria-label="Past digs">
      <ul className="discover-runs__list">
        {runs.map((run) => (
          <RunRow
            key={run.id}
            run={run}
            genres={genres}
            selected={selected === run.id}
            onSelect={() => onSelect(run.id)}
            onDelete={onDelete}
            onContinue={onContinue}
            continueBlocked={continueBlocked}
          />
        ))}
      </ul>
      {runs.length < total &&
        (runs.length >= max ? (
          <p className="discover-note">{`Showing the newest ${formatCount(max)}`}</p>
        ) : loadingMore ? (
          <Loading what="older digs" />
        ) : (
          <ShowMore total={total} expanded={false} onToggle={onShowMore} />
        ))}
    </nav>
  );
}
