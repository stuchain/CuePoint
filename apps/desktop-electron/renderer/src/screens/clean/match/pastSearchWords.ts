/**
 * The words of Past searches (C14): one run per row.
 *
 * A run is a first search and the resumes that finished it, counted by what the
 * tracks are **now** (the engine's counts follow the tracks), so "42 waiting
 * for you" is what still waits, not what the run found a week ago.
 */
import type { MatchRun } from "../../../api/cuepointBridge.types";

function tracks(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "track" : "tracks"}`;
}

function clock(when: Date): string {
  return `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * When a run happened, short: "Today 13:42", "Yesterday 22:10", "10 Oct 18:31".
 * What is not a time is shown as it came, as `formatWhen` does.
 */
export function whenLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  if (sameDay(when, now)) return `Today ${clock(when)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(when, yesterday)) return `Yesterday ${clock(when)}`;
  const day = when.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  const [month, number] = day.split(" ");
  return `${number} ${month} ${clock(when)}`;
}

/** What was matched: the label the window gave it, else how many tracks. */
export function whatLine(run: Pick<MatchRun, "label" | "planned">): string {
  const label = run.label?.trim();
  return label ? label : tracks(run.planned);
}

export type ResultTone = "found" | "waiting" | "missing";

export interface ResultPart {
  text: string;
  tone: ResultTone;
}

/**
 * "131 found · 42 waiting for you · 6 not found · 1,164 not reached". Parts
 * that are zero are left out, and a run that has found nothing says so.
 */
export function resultParts(run: MatchRun): ResultPart[] {
  const parts: ResultPart[] = [];
  const add = (count: number, text: string, tone: ResultTone) => {
    if (count > 0) parts.push({ text: `${count.toLocaleString()} ${text}`, tone });
  };
  add(run.found, "found", "found");
  add(run.waiting, "waiting for you", "waiting");
  add(run.not_found, "not found", "missing");
  add(run.rejected, "rejected", "missing");
  add(Math.max(0, run.planned - run.done), "not reached", "missing");
  if (parts.length === 0) parts.push({ text: "Nothing found yet", tone: "missing" });
  return parts;
}

export type StatusTone = "done" | "stopped" | "running";

export interface RunStatus {
  label: string;
  tone: StatusTone;
}

/** Done, "Stopped at 1,040" or Running. */
export function statusOf(run: Pick<MatchRun, "status" | "done">): RunStatus {
  switch (run.status) {
    case "running":
      return { label: "Running", tone: "running" };
    case "stopped":
      return { label: `Stopped at ${run.done.toLocaleString()}`, tone: "stopped" };
    default:
      return { label: "Done", tone: "done" };
  }
}

/** A run can be resumed when it stopped and the engine says which job to resume. */
export function canResume(run: Pick<MatchRun, "status" | "resume_job_id">): boolean {
  return run.status === "stopped" && run.resume_job_id !== null;
}
