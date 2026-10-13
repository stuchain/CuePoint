/**
 * Every sentence the Clean page says (CLEAN-12).
 *
 * Kept here, and pure, for `libraryFormat.ts`'s reason: the words are the
 * feature. "Accepted" on its own does not say whether a person or the matcher
 * decided, and a reviewer about to override a decision needs to know which.
 */
import type {
  DuplicateSignal,
  FileStatus,
  MatchAttempt,
  MatchStarted,
  MatchState,
  TrackMatchState,
} from "../../api/cuepointBridge.types";

function count(number: number, noun: string): string {
  return `${number.toLocaleString()} ${noun}${number === 1 ? "" : "s"}`;
}

/**
 * Where a track stands, in the words every page uses for it (CLN-4).
 *
 * The Match area, the Library's Match column and the Inspector's Beatport
 * section all draw this one function, so a state is called one thing wherever
 * it is seen. The stored states (`needs_review`, `no_match`, ...) do not change.
 */
export function matchStateLabel(state: MatchState | null | undefined): string {
  switch (state) {
    case "needs_review":
      return "Waiting for you";
    case "accepted":
      return "Confirmed";
    case "rejected":
      return "Rejected";
    case "no_match":
      return "No match";
    case "not_matched":
      return "Not matched";
    default:
      return "";
  }
}

/** What "changed since you decided" means, where a hint can say it. */
export const DISPUTED_HINT = "A newer search found a different best match than the one you chose.";

/** Where a track stands and who put it there, in one line. */
export function decisionLine(state: TrackMatchState): string {
  const by = state.decided_by === "user" ? "by you" : "automatically";
  let line: string;
  switch (state.state) {
    case "accepted":
      line = `Confirmed ${by}`;
      break;
    case "rejected":
      line = `Rejected ${by}`;
      break;
    case "needs_review":
      line = "Waiting for you";
      break;
    case "no_match":
      line = "No match";
      break;
    default:
      line = "Not matched";
  }
  return state.disputed ? `${line} — changed since you decided` : line;
}

/**
 * Why a guard ruled out a candidate, in words (DEC-066, CLN-5).
 *
 * The matcher records a code. The four guards and the missing title are the
 * codes it writes; anything else is shown as its code in words, rather than
 * hidden, because a reason nobody can read is still a reason.
 */
export function rejectReasonText(reason: string | null | undefined): string {
  switch (reason) {
    case "guard_title_subset_match":
      return "Ruled out: its title is only part of this track's title";
    case "guard_title_token_coverage":
      return "Ruled out: too few words of the title match";
    case "title_only_too_low":
      return "Ruled out: no artist to compare, and the title is not close enough";
    case "guard_artist_sim_no_overlap":
      return "Ruled out: no artist in common";
    case "no_title":
      return "Ruled out: Beatport gave it no title";
    case null:
    case undefined:
    case "":
      return "Ruled out by a check";
    default:
      return `Ruled out: ${reason.replace(/_/g, " ")}`;
  }
}

export function signalLabel(signal: DuplicateSignal): string {
  switch (signal) {
    case "path":
      return "Same file";
    case "beatport":
      return "Same Beatport track";
    case "text":
      return "Same artist and title";
  }
}

/** What put these tracks together, stated as the rule it is (DEC-074). */
export function signalExplanation(signal: DuplicateSignal): string {
  switch (signal) {
    case "path":
      return "These entries point at the same file on disk.";
    case "beatport":
      return "These tracks were matched to the same track on Beatport.";
    case "text":
      return "The artist, title and mix say the same thing, and the lengths agree within two seconds.";
  }
}

export function fileStatusLabel(status: FileStatus | null | undefined): string {
  switch (status) {
    case "present":
      return "Present";
    case "missing":
      return "Missing";
    case "unreadable":
      return "Unreadable";
    case "not_checked":
      return "Not checked";
    default:
      return "";
  }
}

/** What a file status means, when its word alone does not say (CLN-8). */
export function fileStatusHint(status: FileStatus | null | undefined): string {
  switch (status) {
    case "missing":
      return "nothing is at that path";
    case "unreadable":
      return "the file is there but CuePoint cannot open it";
    default:
      return "";
  }
}

/**
 * A recorded time, as a person reads one.
 *
 * Anything that is not a time is shown as it came, rather than as "Invalid
 * Date": the engine said something, and saying it is more use than hiding it.
 */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** A match that started, and what it left out (DEC-065). */
export function matchStartedLine(started: Pick<MatchStarted, "planned" | "excluded">): string {
  const head = `Matching ${count(started.planned, "track")} on Beatport.`;
  if (started.excluded <= 0) return head;
  const verb = started.excluded === 1 ? "is" : "are";
  return `${head} ${started.excluded.toLocaleString()} already matched or decided ${verb} left out.`;
}

/**
 * A running match, in one line (C22): "Matching hj · 108 of 180", with the bar
 * under it drawn by the page. The name is what the run was started with; back
 * on the page after leaving it, or before the first count, the line is shorter.
 * What the job is and that the person can carry on is said once, by the
 * status strip's explainer, not repeated here.
 */
export function matchRunningNote(
  label?: string | null,
  progress?: { done: number; total: number } | null,
): string {
  const known = progress && progress.total > 0;
  if (!known) return label ? `Matching ${label}…` : "Matching…";
  const counted = `${progress.done.toLocaleString()} of ${progress.total.toLocaleString()}`;
  return label ? `Matching ${label} · ${counted}` : `Matching · ${counted}`;
}

/** One track corrected: said where the reviewer is looking, with Undo beside it (C14). */
/** The most characters the engine keeps of a run's name. */
export const MATCH_LABEL_LIMIT = 200;

/** A run's name kept within the engine's limit: 199 characters and an ellipsis, so it is not refused. */
export function clampLabel(label: string): string {
  return label.length > MATCH_LABEL_LIMIT ? `${label.slice(0, MATCH_LABEL_LIMIT - 1)}…` : label;
}

export function correctedLine(title: string): string {
  return `Corrected “${title}”.`;
}

/** Correct that changed nothing: the track already had all of it, so there is nothing to undo. */
export function nothingToCorrectLine(title: string): string {
  return `Nothing to change for “${title}”.`;
}

export function nothingToCorrectManyLine(): string {
  return "Nothing to change for those tracks.";
}

export function notThisLine(title: string): string {
  return `Marked “${title}” as not this track.`;
}

export function undidLine(title: string): string {
  return `Undid the change to “${title}”.`;
}

export function correctedManyLine(tracks: number): string {
  return `Corrected ${count(tracks, "track")}.`;
}

/** One attempt in the picker (a disputed track has more than one): when, what came of it, and its notes. */
export function attemptLabel(
  attempt: Pick<MatchAttempt, "id" | "outcome" | "finished_at">,
  index: number,
  decidedOn: number | null,
): string {
  const outcome =
    attempt.outcome === "matched"
      ? "matched"
      : attempt.outcome === "no_match"
        ? "found nothing"
        : "failed";
  const notes = [index === 0 ? "latest" : null, attempt.id === decidedOn ? "decided" : null]
    .filter(Boolean)
    .join(", ");
  return `${formatWhen(attempt.finished_at)} — ${outcome}${notes ? ` (${notes})` : ""}`;
}

export function exportedLine(count_: number, filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  return `Exported ${count(count_, "track")} to ${name}.`;
}

export function trackCount(number: number): string {
  return count(number, "track");
}
