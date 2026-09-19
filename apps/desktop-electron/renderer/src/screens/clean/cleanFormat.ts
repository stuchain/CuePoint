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
  MatchStarted,
  MatchState,
  ResumableMatch,
  TrackMatchState,
} from "../../api/cuepointBridge.types";

function count(number: number, noun: string): string {
  return `${number.toLocaleString()} ${noun}${number === 1 ? "" : "s"}`;
}

export function matchStateLabel(state: MatchState | null | undefined): string {
  switch (state) {
    case "needs_review":
      return "Needs review";
    case "accepted":
      return "Accepted";
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

/** Where a track stands and who put it there, in one line. */
export function decisionLine(state: TrackMatchState): string {
  const by = state.decided_by === "user" ? "by you" : "automatically";
  let line: string;
  switch (state.state) {
    case "accepted":
      line = `Accepted ${by}`;
      break;
    case "rejected":
      line = `Rejected ${by}`;
      break;
    case "needs_review":
      line = "Needs review";
      break;
    case "no_match":
      line = "Beatport found nothing to match";
      break;
    default:
      line = "Not matched yet";
  }
  return state.disputed ? `${line} — a newer match disagrees` : line;
}

/**
 * Why a guard refused a candidate, in words (DEC-066).
 *
 * The matcher records a code. The four guards and the missing title are the
 * codes it writes; anything else is shown as its code in words, rather than
 * hidden, because a reason nobody can read is still a reason.
 */
export function rejectReasonText(reason: string | null | undefined): string {
  switch (reason) {
    case "guard_title_subset_match":
      return "Refused: its title is only part of this track's title";
    case "guard_title_token_coverage":
      return "Refused: too few words of the title match";
    case "title_only_too_low":
      return "Refused: no artist to compare, and the title is not close enough";
    case "guard_artist_sim_no_overlap":
      return "Refused: no artist in common";
    case "no_title":
      return "Refused: Beatport gave it no title";
    case null:
    case undefined:
    case "":
      return "Refused by a guard";
    default:
      return `Refused: ${reason.replace(/_/g, " ")}`;
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
 * A match that stopped with tracks left, offered for resuming (DEC-065).
 *
 * `total` is how many can be resumed; the newest is the one offered, and the
 * others are counted rather than listed.
 */
export function resumableLine(newest: Pick<ResumableMatch, "remaining" | "planned">, total: number): string {
  const head = `A match stopped with ${newest.remaining.toLocaleString()} of ${count(newest.planned, "track")} left.`;
  if (total <= 1) return `${head} Resuming matches only those.`;
  const others = total - 1;
  const matches = others === 1 ? "other match" : "other matches";
  return `${head} ${others.toLocaleString()} ${matches} can be resumed from Activity.`;
}

/** A decision taken from the review panel, said where the reviewer is looking. */
export function decidedLine(decision: "accept" | "reject" | "clear", title: string): string {
  switch (decision) {
    case "accept":
      return `Accepted a match for “${title}”.`;
    case "reject":
      return `Rejected the match for “${title}”.`;
    case "clear":
      return `Cleared your decision for “${title}”.`;
  }
}

export function appliedLine(fields: readonly string[], title: string): string {
  return `Applied ${fields.join(", ")} to “${title}”.`;
}

export function exportedLine(count_: number, filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  return `Exported ${count(count_, "track")} to ${name}.`;
}

export function trackCount(number: number): string {
  return count(number, "track");
}
