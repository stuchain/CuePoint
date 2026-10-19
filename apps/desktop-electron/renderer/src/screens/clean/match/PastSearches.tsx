/**
 * Past searches: every match run, newest first (C14, DEC-065).
 *
 * A run is the first search and the resumes that finished it, so a match that
 * was stopped and resumed twice is one row. The counts are what the tracks are
 * now, which is what still needs the reader: "42 waiting for you" goes down as
 * tracks are corrected. Each row has its buttons — **Open** (its tracks, in One
 * at a time and the Table), **Resume** (a stopped one, only what it had not
 * reached), **Match again**, **Save review list…** (that run's list as a file,
 * K12) — so nothing is hidden behind a hover or a menu.
 */
import { useEffect, useState } from "react";

import type { MatchRun } from "../../../api/cuepointBridge.types";
import { formatDayTime } from "../../../format/dates";
import { EmptyState } from "../../../components/EmptyState";
import { Badge, type BadgeVariant } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { Notice } from "../../../components/Notice";
import { SearchField } from "../../../components/SearchField";
import { formatCount } from "../../../format/counts";
import { nothingMatches } from "../../../format/words";
import { canResume, resultParts, statusOf, whatLine, type StatusTone } from "./pastSearchWords";
import { ReviewListSave } from "./ReviewListSave";
import { useMatchJobs } from "./useMatchJobs";
import { NEEDS_DESKTOP } from "../../../api/userMessage";

const STATUS_VARIANTS: Record<StatusTone, BadgeVariant> = {
  done: "success",
  stopped: "warning",
  running: "info",
};

interface PastSearchesProps {
  /** Bumped when a match ends, so the list is read again. */
  version: number;
  /** A match is running now: starting another is refused until it ends. */
  matching: boolean;
  /** The run whose tracks the page is showing, marked in the list. */
  openId: string | null;
  onOpen: (run: MatchRun) => void;
  onResume: (run: MatchRun) => void;
  onMatchAgain: (run: MatchRun) => void;
  /** The empty state's button: back to the Playlists sub-tab, where a match is started. */
  onGoToPlaylists: () => void;
}

export function PastSearches({
  version,
  matching,
  openId,
  onOpen,
  onResume,
  onMatchAgain,
  onGoToPlaylists,
}: PastSearchesProps) {
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<{ run: MatchRun; open: boolean } | null>(null);
  // The engine does the searching: wait for a pause in typing before asking.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(typed), 250);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const jobs = useMatchJobs(query, version);
  const canResumeHere = Boolean(window.cuepoint?.resumeCleanMatch);
  const now = new Date();
  // The box is for a list with something in it; a search that found nothing keeps it, to be cleared.
  const searchable = typed.trim() !== "" || query.trim() !== "" || jobs.runs.length > 0 || jobs.loading;
  const searching = query.trim() !== "";

  return (
    <section className="match-past" aria-label="Past searches">
      {searchable && (
        <div className="match-past__bar">
          <SearchField
            thing="past searches"
            label="Search"
            className="match-past__search"
            value={typed}
            onValueChange={setTyped}
          />
        </div>
      )}

      {jobs.error && <Notice kind="problem">{jobs.error}</Notice>}
      {!jobs.available && (
        <p className="match-past__empty">{NEEDS_DESKTOP}</p>
      )}
      {jobs.available && !jobs.error && jobs.runs.length === 0 && !jobs.loading && (
        <EmptyState
          icon="clean"
          headline={searching ? nothingMatches(query.trim()).replace(/[.]$/, "") : "No searches yet"}
          description={searching ? undefined : "Each Match on Beatport is kept here, so you can see what it found."}
          action={searching ? undefined : { label: "Go to Playlists", onClick: onGoToPlaylists }}
        />
      )}

      {jobs.runs.length > 0 && (
        <div className="match-past__scroll">
          <table className="match-past__table">
            <caption className="match-visually-hidden">Every match run, newest first</caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What was matched</th>
                <th scope="col" className="match-past__number">
                  Tracks
                </th>
                <th scope="col">Results</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="match-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.runs.map((run) => {
                const status = statusOf(run);
                const what = whatLine(run);
                return (
                  <tr key={run.job_id} data-open={run.job_id === openId ? "true" : undefined}>
                    <td>{formatDayTime(run.created_at, { now }) || run.created_at || ""}</td>
                    <td>{what}</td>
                    <td className="match-past__number">{formatCount(run.planned)}</td>
                    <td>
                      {resultParts(run).map((part, index) => (
                        <span key={part.text} className={`match-result match-result--${part.tone}`}>
                          {index > 0 && <span className="match-result__dot"> · </span>}
                          {part.text}
                        </span>
                      ))}
                    </td>
                    <td>
                      <Badge variant={STATUS_VARIANTS[status.tone]}>{status.label}</Badge>
                    </td>
                    <td className="match-past__actions">
                      {canResume(run) && canResumeHere && (
                        <Button variant="primary"
                          aria-label={`Resume ${what}`}
                          disabled={matching}
                          onClick={() => onResume(run)}
                        >
                          Resume
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        aria-label={`Open ${what}`}
                        onClick={() => onOpen(run)}
                      >
                        Open
                      </Button>
                      <Button
                        variant="secondary"
                        aria-label={`Save review list of ${what} as a file…`}
                        onClick={() => setSaving({ run, open: true })}
                      >
                        Save review list…
                      </Button>
                      {run.status !== "running" && (
                        <Button
                          variant="secondary"
                          aria-label={`Match ${what} again`}
                          disabled={matching}
                          onClick={() => onMatchAgain(run)}
                        >
                          Match again
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {jobs.total > jobs.runs.length && (
            <p className="match-past__more">
              Showing the newest {formatCount(jobs.runs.length)} of {formatCount(jobs.total)}.
              Search to find an older one.
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
