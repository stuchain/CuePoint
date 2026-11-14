/**
 * Past matches: every match run, newest first (C14, DEC-065, D33).
 *
 * A run is the first search and the resumes that finished it, so a match that was stopped and
 * resumed twice is one row. The counts are what the tracks are now, which is what still needs the
 * reader: "42 to check" goes down as tracks are corrected. It stays a table (D8) in the shared
 * look, and a row opens like a Discover run: click it, and its review opens. Each row is named for
 * its source (the playlist, "All tracks"), and that name is the row's one link for the keyboard,
 * "Open …" (M475). Runs of the same source one after another fold into one row with "13×" and an
 * arrow that shows the earlier ones (M150). The one action slot at the right is a **More** menu:
 * **Resume** for a stopped run (only what it had not reached), **Save review list…** (that run's
 * list as a file, K12) and **Match again** (M150, M151).
 *
 * The search is the Match area's one search, on its row; this list reads what it holds.
 *
 * Deleting (I3): a tick column first, and **Delete…** under the table for the ticked runs or in a
 * row's More menu for one. It asks first, in the shared danger confirmation, and says what goes:
 * only the record of the search (its rows here and its review list). Every track keeps its match,
 * its corrections and what the person decided, because the engine deletes nothing but the run's
 * plan rows (`delete_runs`). A run still going cannot be deleted. A folded group's box ticks the
 * runs in it, and ticks clear when the search changes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import "../../library/SelectionActions.css";

import type { MatchRun } from "../../../api/cuepointBridge.types";
import { needsDesktopApp, userMessage } from "../../../api/userMessage";
import { Badge, type BadgeVariant } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useToast } from "../../../components/Toast";
import { DisclosureArrow } from "../../../components/DisclosureArrow";
import { EmptyState } from "../../../components/EmptyState";
import { SkeletonTable } from "../SkeletonTable";
import { Notice } from "../../../components/Notice";
import { TrackContextMenu } from "../../../components/TrackContextMenu";
import { formatCount, plural } from "../../../format/counts";
import { formatDayTime } from "../../../format/dates";
import { RETRY, nothingMatches, quoted } from "../../../format/words";
import { reportUnexpected } from "../../../reporting/reporting";
import {
  canResume,
  deleteWords,
  groupRuns,
  resultParts,
  statusOf,
  stopLine,
  whatLine,
  type RunGroup,
  type StatusTone,
} from "./pastSearchWords";
import { ReviewListSave } from "./ReviewListSave";
import { useMatchJobs } from "./useMatchJobs";

const STATUS_VARIANTS: Record<StatusTone, BadgeVariant> = {
  done: "success",
  stopped: "warning",
  running: "info",
  failed: "danger",
};


interface PastSearchesProps {
  /** What the area's search holds: the engine searches by it, after a pause in typing. */
  search: string;
  /** Bumped when a match ends, so the list is read again. */
  version: number;
  /** A match is running now: starting another is refused until it ends. */
  matching: boolean;
  /** The run whose tracks the page is showing, marked in the list. */
  openId?: string | null;
  onOpen: (run: MatchRun) => void;
  onResume: (run: MatchRun) => void;
  onMatchAgain: (run: MatchRun) => void;
  /** The empty state's button: back to the Playlists sub-tab, where a match is started. */
  onGoToPlaylists: () => void;
  /**
   * Runs were deleted, by their job ids and as they were listed, so the area can close a review of
   * one of them whatever job of the run it was opened by.
   */
  onDeleted?: (jobIds: readonly string[], runs: readonly MatchRun[]) => void;
  /** How many runs are listed, so the area can hide its search until there is something to search (M150). */
  onCount?: (count: number) => void;
}

export function PastSearches({
  search,
  version,
  matching,
  openId = null,
  onOpen,
  onResume,
  onMatchAgain,
  onGoToPlaylists,
  onDeleted,
  onCount,
}: PastSearchesProps) {
  const { push } = useToast();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<{ run: MatchRun; open: boolean } | null>(null);
  // The engine does the searching: wait for a pause in typing before asking.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const jobs = useMatchJobs(query, version);
  // A search that finds nothing is not "no runs": only an unfiltered list says whether there are any.
  const listed = jobs.runs.length;
  useEffect(() => {
    if (query.trim() === "" && jobs.answered && !jobs.loading) onCount?.(listed);
  }, [jobs.answered, jobs.loading, listed, onCount, query]);
  // Which runs are ticked, by job id; a run still going is never ticked (it cannot be deleted).
  const canDelete = Boolean(window.cuepoint?.deleteMatchJobs);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  // Asked to delete these runs (job ids): the dialog is open while this holds some.
  const [deleting, setDeleting] = useState<readonly string[] | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // A different search lists different runs: what was ticked in the last one is not what is shown.
  useEffect(() => setTicked(new Set()), [query]);
  // A run that is gone from the list (deleted, or paged out) is no longer ticked.
  useEffect(() => {
    setTicked((current) => {
      const present = new Set(jobs.runs.filter((one) => one.status !== "running").map((one) => one.job_id));
      const kept = [...current].filter((id) => present.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [jobs.runs]);
  const [menu, setMenu] = useState<{ run: MatchRun; group: RunGroup | null; x: number; y: number } | null>(null);
  const menuAnchor = useRef<HTMLElement | null>(null);
  const canResumeHere = Boolean(window.cuepoint?.resumeCleanMatch);
  const now = new Date();
  const searching = query.trim() !== "";
  const groups = useMemo(() => groupRuns(jobs.runs), [jobs.runs]);
  // Which folded groups show their earlier runs, by the newest run's id.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(() => new Set());
  const toggleFold = (id: string) =>
    setUnfolded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const deletable = (one: MatchRun) => one.status !== "running";
  /** The runs one row stands for: a folded group's row, all of its runs; any other row, itself. */
  const idsOf = (run: MatchRun, group: RunGroup | null): string[] =>
    (group && !unfolded.has(run.job_id) ? [group.newest, ...group.earlier] : [run]).filter(deletable).map((one) => one.job_id);
  const setMany = (ids: readonly string[], on: boolean) =>
    setTicked((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const allIds = useMemo(() => jobs.runs.filter((one) => one.status !== "running").map((one) => one.job_id), [jobs.runs]);
  const allTicked = allIds.length > 0 && allIds.every((id) => ticked.has(id));
  const someTicked = allIds.some((id) => ticked.has(id));
  const headerTick = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerTick.current) headerTick.current.indeterminate = someTicked && !allTicked;
  }, [allTicked, someTicked, jobs.runs.length]);

  const deletingRuns = useMemo(
    () => (deleting ? jobs.runs.filter((one) => deleting.includes(one.job_id)) : []),
    [deleting, jobs.runs],
  );

  const confirmDelete = async () => {
    const ids = deleting;
    const remove = window.cuepoint?.deleteMatchJobs;
    if (!ids || !remove) return;
    setDeleteBusy(true);
    try {
      const { deleted } = await remove({ job_ids: [...ids] });
      // Nothing deleted means they were already gone: the reload shows the list as it is.
      if (deleted > 0) push(`Deleted ${plural(deleted, "past match", "past matches")}`, "success");
      setTicked(new Set());
      setDeleting(null);
      onDeleted?.(
        ids,
        jobs.runs.filter((one) => ids.includes(one.job_id)),
      );
      jobs.reload();
    } catch (cause) {
      reportUnexpected(cause);
      push(userMessage(cause), "warning");
      setDeleting(null);
      // The refusal may be a run that is running now: show it so, and drop its tick.
      jobs.reload();
    } finally {
      setDeleteBusy(false);
    }
  };

  const row = (run: MatchRun, group: RunGroup | null) => {
    const status = statusOf(run);
    const what = whatLine(run);
    // A name someone chose is quoted; "12 tracks" is not a name (C164).
    const named = run.label?.trim() ? quoted(what) : what;
    const isOpen = run.job_id === openId;
    const count = group ? group.earlier.length + 1 : 1;
    const unfoldedHere = group !== null && unfolded.has(run.job_id);
    const earlier = count - 1;
    const rowIds = idsOf(run, group);
    const rowTicked = rowIds.filter((id) => ticked.has(id)).length;
    return (
      <tr
        key={run.job_id}
        className={`match-past__row${group === null ? " match-past__row--earlier" : ""}`}
        data-open={isOpen ? "true" : undefined}
        aria-selected={isOpen}
        onClick={(event) => {
          // A click on a button inside the row is that button's own.
          if ((event.target as HTMLElement).closest("button, input, .match-past__tick")) return;
          onOpen(run);
        }}
      >
        {canDelete && (
          <td className="match-past__tick">
            <input
              type="checkbox"
              aria-label={`Select ${named}, ${formatDayTime(run.created_at, { now }) || run.created_at || ""}`}
              checked={rowIds.length > 0 && rowTicked === rowIds.length}
              ref={(box) => {
                if (box) box.indeterminate = rowTicked > 0 && rowTicked < rowIds.length;
              }}
              disabled={rowIds.length === 0}
              onChange={() => setMany(rowIds, rowTicked < rowIds.length)}
            />
          </td>
        )}
        <td className="match-past__when match-past__fit">{formatDayTime(run.created_at, { now }) || run.created_at || ""}</td>
        <td className="match-past__what">
          <div className="match-past__what-line">
            {/* The row's one stop for the keyboard: a link that opens it (M475). */}
            <button
              type="button"
              className="cp-link match-past__open"
              aria-label={`Open ${named}`}
              data-cut-hint
              onClick={() => onOpen(run)}
            >
              {what}
            </button>
            {earlier > 0 && (
              <button
                type="button"
                className="match-past__fold"
                aria-expanded={unfoldedHere}
                aria-label={`${unfoldedHere ? "Hide" : "Show"} ${formatCount(earlier)} earlier ${earlier === 1 ? "run" : "runs"} of ${named}`}
                onClick={() => toggleFold(run.job_id)}
              >
                <span className="match-past__times">{`${formatCount(count)}×`}</span>
                <DisclosureArrow open={unfoldedHere} />
              </button>
            )}
          </div>
        </td>
        <td className="match-past__fit">
          {resultParts(run).map((part, index) => (
            <span key={part.text} className={`match-result match-result--${part.tone}`}>
              {index > 0 && <span className="match-result__dot"> · </span>}
              {part.text}
            </span>
          ))}
        </td>
        <td className="match-past__fit">
          <Badge variant={STATUS_VARIANTS[status.tone]}>{status.label}</Badge>
          {stopLine(run) && <span className="match-past__why"> · {stopLine(run)}</span>}
        </td>
        <td className="match-past__end">
          {/* One action slot: Resume, Save review list… and Match again are in its menu (M150). */}
          <div className="cp-button-row match-past__actions">
            <Button
              size="sm"
              variant="quiet"
              aria-label={`More for ${named}`}
              aria-haspopup="menu"
              aria-expanded={menu?.run.job_id === run.job_id}
              onClick={(event) => {
                menuAnchor.current = event.currentTarget;
                if (menu?.run.job_id === run.job_id) {
                  setMenu(null);
                  return;
                }
                const rect = event.currentTarget.getBoundingClientRect();
                setMenu({ run, group, x: rect.left, y: rect.bottom });
              }}
            >
              More
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    // Past matches are the Match area's pane for F6 (M459).
    <section className="match-past" aria-label="Past matches" data-pane="past">
      {jobs.error && (
        <Notice
          kind="danger"
          action={
            <Button variant="secondary" onClick={jobs.reload}>
              {RETRY}
            </Button>
          }
        >
          {jobs.error}
        </Notice>
      )}
      {!jobs.available && <EmptyState compact headline={needsDesktopApp()} />}
      {jobs.available && jobs.loading && jobs.runs.length === 0 && (
        // The table's shape while it loads, not a spinner (M373).
        <SkeletonTable
          what="past matches"
          columns={[...(canDelete ? [""] : []), "When", "What was matched", "Results", "Status", ""]}
        />
      )}
      {jobs.available && !jobs.error && jobs.runs.length === 0 && !jobs.loading && (
        // The whole view is empty, so the full empty state with its icon, as on the other tabs (C140).
        <EmptyState
          icon="search"
          headline={searching ? nothingMatches(query.trim()).replace(/[.]$/, "") : "No past matches yet"}
          description={searching ? undefined : "Each match on Beatport is kept here, so you can see what it found."}
          action={searching ? undefined : { label: "Go to Playlists", onClick: onGoToPlaylists }}
        />
      )}

      {jobs.runs.length > 0 && (
        <div className="match-past__scroll">
          <table className="cp-data-table match-past__table">
            <caption className="cp-visually-hidden">Every match run, newest first</caption>
            <thead>
              <tr>
                {canDelete && (
                  <th scope="col" className="match-past__tick">
                    <input
                      ref={headerTick}
                      type="checkbox"
                      aria-label="Select every past match"
                      checked={allTicked}
                      disabled={allIds.length === 0}
                      onChange={() => setMany(allIds, !allTicked)}
                    />
                  </th>
                )}
                {/* When, Results and Status fit their words; What was matched gives way (new H). The
                    rows are named for their source, so there is no Tracks column (M151). */}
                <th scope="col" className="match-past__fit">When</th>
                <th scope="col">What was matched</th>
                <th scope="col" className="match-past__fit">Results</th>
                <th scope="col" className="match-past__fit">Status</th>
                <th scope="col" className="match-past__end">
                  <span className="cp-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((group) => [
                row(group.newest, group),
                ...(unfolded.has(group.newest.job_id) ? group.earlier.map((run) => row(run, null)) : []),
              ])}
            </tbody>
          </table>
          {jobs.total > jobs.runs.length && (
            <p className="cp-prose match-past__more">
              Showing the newest {formatCount(jobs.runs.length)} of {formatCount(jobs.total)}. Search to find an
              older one.
            </p>
          )}
        </div>
      )}

      {canDelete && ticked.size > 0 && (
        // The shared selection bar's look, under the table (the Missing files bar's form).
        <div className="cp-toolbar clean-review__selection match-past__selection">
          <div className="cp-selection-actions" role="toolbar" aria-label="Selection">
            <span className="cp-selection-actions__count" role="status">
              {plural(ticked.size, "past match", "past matches")} selected
            </span>
            <Button variant="danger" onClick={() => setDeleting([...ticked])}>
              Delete…
            </Button>
            <Button variant="secondary" onClick={() => setTicked(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        danger
        loading={deleteBusy}
        title={deleting && deleting.length > 1 ? `Delete ${formatCount(deleting.length)} past matches?` : "Delete this past match?"}
        confirmLabel={deleting && deleting.length > 1 ? `Delete ${formatCount(deleting.length)}` : "Delete"}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      >
        {deleteWords(deletingRuns, deleting?.length ?? 0)}
      </ConfirmDialog>

      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          label="Match actions"
          anchor={menuAnchor}
          onClose={() => setMenu(null)}
          items={[
            ...(canResume(menu.run) && canResumeHere
              ? [
                  {
                    id: "resume",
                    label: "Resume",
                    title: "Match what this run had not reached",
                    // A resume does not queue behind a running match, as Match again does (M510).
                    disabled: matching,
                    reason: "Another match is running",
                    onSelect: () => onResume(menu.run),
                  },
                ]
              : []),
            {
              id: "save",
              label: "Save review list…",
              onSelect: () => setSaving({ run: menu.run, open: true }),
            },
            {
              id: "again",
              label: "Match again",
              // A second match queues behind the running one (M510), so only a run still going is refused.
              disabled: menu.run.status === "running",
              reason: "This match is still running",
              onSelect: () => onMatchAgain(menu.run),
            },
            ...(canDelete
              ? [
                  {
                    id: "delete",
                    label: "Delete…",
                    danger: true,
                    // Its worker is still writing the run's rows.
                    // A folded group deletes the runs it stands for, as its tick selects them.
                    disabled: idsOf(menu.run, menu.group).length === 0,
                    reason: "This match is still running",
                    onSelect: () => setDeleting(idsOf(menu.run, menu.group)),
                  },
                ]
              : []),
          ]}
        />
      )}

      <ReviewListSave
        run={saving?.run ?? null}
        open={saving?.open ?? false}
        onClose={() => setSaving((last) => (last ? { ...last, open: false } : null))}
      />
    </section>
  );
}
