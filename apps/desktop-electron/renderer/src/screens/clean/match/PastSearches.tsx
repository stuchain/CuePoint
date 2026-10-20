/**
 * Past searches: every match run, newest first (C14, DEC-065).
 *
 * A run is the first search and the resumes that finished it, so a match that was stopped and
 * resumed twice is one row. The counts are what the tracks are now, which is what still needs the
 * reader: "42 to check" goes down as tracks are corrected. It stays a table (D8) in the shared
 * look, and a row opens like a Discover run: click it, or press Enter on it, and its review opens.
 * Each row has its buttons in one fixed column at the right, small and grey: **Resume** (a stopped
 * one, only what it had not reached), **Save review list…** (that run's list as a file, K12) and
 * **Match again**, so nothing is hidden behind a hover or a menu.
 *
 * The search is the Match area's one search, on its row; this list reads what it holds.
 */
import { useEffect, useState } from "react";

import type { MatchRun } from "../../../api/cuepointBridge.types";
import { needsDesktopApp } from "../../../api/userMessage";
import { Badge, type BadgeVariant } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { Loading } from "../../../components/Loading";
import { Notice } from "../../../components/Notice";
import { formatCount } from "../../../format/counts";
import { formatDayTime } from "../../../format/dates";
import { RETRY, nothingMatches, quoted } from "../../../format/words";
import { canResume, resultParts, statusOf, stopLine, whatLine, type StatusTone } from "./pastSearchWords";
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
}: PastSearchesProps) {
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<{ run: MatchRun; open: boolean } | null>(null);
  // The engine does the searching: wait for a pause in typing before asking.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const jobs = useMatchJobs(query, version);
  const canResumeHere = Boolean(window.cuepoint?.resumeCleanMatch);
  const now = new Date();
  const searching = query.trim() !== "";

  return (
    <section className="match-past" aria-label="Past searches">
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
      {jobs.available && jobs.loading && jobs.runs.length === 0 && <Loading what="past searches" />}
      {jobs.available && !jobs.error && jobs.runs.length === 0 && !jobs.loading && (
        // The whole view is empty, so the full empty state with its icon, as on the other tabs (C140).
        <EmptyState
          icon="clean"
          headline={searching ? nothingMatches(query.trim()).replace(/[.]$/, "") : "No searches yet"}
          description={searching ? undefined : "Each Match on Beatport is kept here, so you can see what it found."}
          action={searching ? undefined : { label: "Go to Playlists", onClick: onGoToPlaylists }}
        />
      )}

      {jobs.runs.length > 0 && (
        <div className="match-past__scroll">
          <table className="cp-data-table match-past__table">
            <caption className="match-visually-hidden">Every match run, newest first</caption>
            <thead>
              <tr>
                {/* When, Tracks, Results and Status fit their words; What was matched gives way (new H). */}
                <th scope="col" className="match-past__fit">When</th>
                <th scope="col">What was matched</th>
                <th scope="col" className="num match-past__fit">
                  Tracks
                </th>
                <th scope="col" className="match-past__fit">Results</th>
                <th scope="col" className="match-past__fit">Status</th>
                <th scope="col" className="match-past__end">
                  <span className="match-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.runs.map((run) => {
                const status = statusOf(run);
                const what = whatLine(run);
                // A name someone chose is quoted; "12 tracks" is not a name (C164).
                const named = run.label?.trim() ? quoted(what) : what;
                const isOpen = run.job_id === openId;
                return (
                  <tr
                    key={run.job_id}
                    className="match-past__row"
                    data-open={isOpen ? "true" : undefined}
                    aria-selected={isOpen}
                    tabIndex={0}
                    aria-label={`Open ${named}`}
                    onClick={(event) => {
                      // A click on a button inside the row is that button's own.
                      if ((event.target as HTMLElement).closest("button")) return;
                      onOpen(run);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget || event.key !== "Enter") return;
                      event.preventDefault();
                      onOpen(run);
                    }}
                  >
                    <td className="match-past__when match-past__fit">{formatDayTime(run.created_at, { now }) || run.created_at || ""}</td>
                    <td className="match-past__what">{what}</td>
                    <td className="num match-past__fit">{formatCount(run.planned)}</td>
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
                      <div className="cp-button-row match-past__actions">
                        {canResume(run) && canResumeHere && (
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Resume ${named}`}
                            disabled={matching}
                            onClick={() => onResume(run)}
                          >
                            Resume
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={`Save review list of ${named} as a file…`}
                          onClick={() => setSaving({ run, open: true })}
                        >
                          Save review list…
                        </Button>
                        {run.status !== "running" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Match ${named} again`}
                            disabled={matching}
                            onClick={() => onMatchAgain(run)}
                          >
                            Match again
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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

      <ReviewListSave
        run={saving?.run ?? null}
        open={saving?.open ?? false}
        onClose={() => setSaving((last) => (last ? { ...last, open: false } : null))}
      />
    </section>
  );
}
