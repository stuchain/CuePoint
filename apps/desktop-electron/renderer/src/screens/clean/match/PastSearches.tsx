/**
 * Past searches: every match run, newest first (C14, DEC-065).
 *
 * A run is the first search and the resumes that finished it, so a match that
 * was stopped and resumed twice is one row. The counts are what the tracks are
 * now, which is what still needs the reader: "42 waiting for you" goes down as
 * tracks are corrected. Each row has its buttons — **Open** (its tracks, in One
 * at a time and the Table), **Resume** (a stopped one, only what it had not
 * reached), **Match again** — so nothing is hidden behind a hover or a menu.
 */
import { useEffect, useState } from "react";

import type { MatchRun } from "../../../api/cuepointBridge.types";
import { Badge, type BadgeVariant } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { TextField } from "../../../components/TextField";
import { canResume, resultParts, statusOf, whatLine, whenLabel, type StatusTone } from "./pastSearchWords";
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
}

export function PastSearches({
  version,
  matching,
  openId,
  onOpen,
  onResume,
  onMatchAgain,
}: PastSearchesProps) {
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  // The engine does the searching: wait for a pause in typing before asking.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(typed), 250);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const jobs = useMatchJobs(query, version);
  const canResumeHere = Boolean(window.cuepoint?.resumeCleanMatch);
  const now = new Date();

  return (
    <section className="match-past" aria-label="Past searches">
      <div className="match-past__bar">
        <TextField
          label="Search"
          type="search"
          className="match-past__search"
          placeholder="name or date…"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </div>

      {jobs.error && (
        <p className="match-past__problem" role="alert">
          {jobs.error}
        </p>
      )}
      {!jobs.available && (
        <p className="match-past__empty">{NEEDS_DESKTOP}</p>
      )}
      {jobs.available && !jobs.error && jobs.runs.length === 0 && !jobs.loading && (
        <p className="match-past__empty">
          {query.trim() ? "No search matches that." : "Nothing has been matched on Beatport yet."}
        </p>
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
                    <td>{whenLabel(run.created_at, now)}</td>
                    <td>{what}</td>
                    <td className="match-past__number">{run.planned.toLocaleString()}</td>
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
                        <Button
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
              Showing the newest {jobs.runs.length.toLocaleString()} of {jobs.total.toLocaleString()}.
              Search to find an older one.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
