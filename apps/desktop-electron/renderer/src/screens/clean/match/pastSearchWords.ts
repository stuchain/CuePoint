/**
 * The words of Past searches (C14): one run per row.
 *
 * A run is a first search and the resumes that finished it, counted by what the
 * tracks are **now** (the engine's counts follow the tracks), so "42 waiting
 * for you" is what still waits, not what the run found a week ago.
 */
import type { MatchRun } from "../../../api/cuepointBridge.types";
import { formatCount, plural } from "../../../format/counts";
import { MATCH_STATE, noMatchCount } from "../../../format/words";

function tracks(count: number): string {
  return plural(count, "track");
}

/** What was matched: the label the window gave it, else how many tracks. */
export function whatLine(run: Pick<MatchRun, "label" | "planned">): string {
  const label = run.label?.trim();
  return label ? label : tracks(run.planned);
}

/**
 * How a part of the results line is drawn: confirmed and no match are quiet grey, tracks to check
 * are amber, and what went wrong (rejected, a search that failed) is red. The words say it too, so
 * colour is never the only cue.
 */
export type ResultTone = "quiet" | "check" | "bad";

export interface ResultPart {
  text: string;
  tone: ResultTone;
}

/**
 * "131 confirmed · 42 to check · 6 no match · 1,164 not reached", in the words every page uses for
 * where a track stands (D2). Parts that are zero are left out, and a run that has found nothing
 * says so.
 */
export function resultParts(run: MatchRun): ResultPart[] {
  const parts: ResultPart[] = [];
  const add = (count: number, text: string, tone: ResultTone) => {
    if (count > 0) parts.push({ text: `${formatCount(count)} ${text}`, tone });
  };
  add(run.found, MATCH_STATE.confirmed.toLowerCase(), "quiet");
  add(run.waiting, MATCH_STATE.toCheck.toLowerCase(), "check");
  if (run.not_found > 0) parts.push({ text: noMatchCount(run.not_found), tone: "quiet" });
  add(run.rejected, MATCH_STATE.rejected.toLowerCase(), "bad");
  add(run.search_failed ?? 0, MATCH_STATE.searchFailed.toLowerCase(), "bad");
  add(Math.max(0, run.planned - run.done), "not reached", "quiet");
  if (parts.length === 0) parts.push({ text: "Nothing found yet", tone: "quiet" });
  return parts;
}

export type StatusTone = "done" | "stopped" | "running" | "failed";

export interface RunStatus {
  label: string;
  tone: StatusTone;
}

/**
 * The run's status in the words Discover's runs use: Running, Done, Stopped and Search failed. A
 * finished run whose every search failed is the last, because nothing is known about its tracks.
 */
export function statusOf(
  run: Pick<MatchRun, "status" | "found" | "waiting" | "not_found" | "rejected" | "search_failed">,
): RunStatus {
  switch (run.status) {
    case "running":
      return { label: "Running", tone: "running" };
    case "stopped":
      return { label: "Stopped", tone: "stopped" };
    default: {
      const known = run.found + run.waiting + run.not_found + run.rejected;
      if ((run.search_failed ?? 0) > 0 && known === 0) return { label: MATCH_STATE.searchFailed, tone: "failed" };
      return { label: "Done", tone: "done" };
    }
  }
}

/** "Beatport did not answer": why a run stopped, said after the Stopped status (no full stop); else null. */
export function stopLine(run: Pick<MatchRun, "status" | "stop_reason">): string | null {
  return run.status === "stopped" && run.stop_reason ? run.stop_reason.replace(/[.]$/, "") : null;
}

/** A run can be resumed when it stopped and the engine says which job to resume. */
export function canResume(run: Pick<MatchRun, "status" | "resume_job_id">): boolean {
  return run.status === "stopped" && run.resume_job_id !== null;
}
