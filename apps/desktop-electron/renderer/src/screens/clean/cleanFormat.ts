/**
 * Every sentence the Clean page says (CLEAN-12).
 *
 * Kept here, and pure, for `libraryFormat.ts`'s reason: the words are the
 * feature. "Accepted" on its own does not say whether a person or the matcher
 * decided, and a reviewer about to override a decision needs to know which.
 */
import { formatCount, plural } from "../../format/counts";
import { formatDayTime } from "../../format/dates";
import { MATCH_STATE } from "../../format/words";
import type {
  DuplicateSignal,
  FileStatus,
  MatchAttempt,
  MatchStarted,
  MatchState,
  TrackMatchState,
} from "../../api/cuepointBridge.types";

function count(number: number, noun: string): string {
  return plural(number, noun);
}

/** Missing files' toolbar line after Check for changes (M157): what the refresh fixed, and what is left. */
export function fixedLine(before: number, left: number): string {
  return `${formatCount(Math.max(0, before - left))} fixed · ${formatCount(left)} still missing`;
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
      return MATCH_STATE.toCheck;
    case "accepted":
      return MATCH_STATE.confirmed;
    case "rejected":
      return MATCH_STATE.rejected;
    case "no_match":
      return MATCH_STATE.noMatch;
    case "not_matched":
      return MATCH_STATE.notLookedUp;
    default:
      return "";
  }
}

/** What "changed after you confirmed" means, where a hint can say it. */
export const DISPUTED_HINT = "A newer search found a different best match than the one you chose";

/** Where a track stands and who put it there, in one line. */
export function decisionLine(state: TrackMatchState): string {
  const by = state.decided_by === "user" ? "by you" : "automatically";
  let line: string;
  switch (state.state) {
    case "accepted":
      line = `${MATCH_STATE.confirmed} ${by}`;
      break;
    case "rejected":
      line = `${MATCH_STATE.rejected} ${by}`;
      break;
    case "needs_review":
      line = MATCH_STATE.toCheck;
      break;
    case "no_match":
      line = MATCH_STATE.noMatch;
      break;
    default:
      line = MATCH_STATE.notLookedUp;
  }
  return state.disputed ? `${line} - changed after you confirmed` : line;
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

/** A match that started, and what it left out (DEC-065). */
export function matchStartedLine(started: Pick<MatchStarted, "planned" | "excluded" | "queued">): string {
  // A second match waits for the one running and starts by itself (M510).
  const head = started.queued
    ? `Queued: ${count(started.planned, "track")} will be matched on Beatport after the running match.`
    : `Matching ${count(started.planned, "track")} on Beatport.`;
  if (started.excluded <= 0) return head;
  const verb = started.excluded === 1 ? "is" : "are";
  return `${head} ${formatCount(started.excluded)} already matched or decided ${verb} left out.`;
}

/** The most characters the engine keeps of a run's name. */
export const MATCH_LABEL_LIMIT = 200;

/** A run's name kept within the engine's limit: 199 characters and an ellipsis, so it is not refused. */
export function clampLabel(label: string): string {
  return label.length > MATCH_LABEL_LIMIT ? `${label.slice(0, MATCH_LABEL_LIMIT - 1)}…` : label;
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
        ? MATCH_STATE.noMatch.toLowerCase()
        : MATCH_STATE.searchFailed.toLowerCase();
  const notes = [index === 0 ? "latest" : null, attempt.id === decidedOn ? "decided" : null]
    .filter(Boolean)
    .join(", ");
  return `${(attempt.finished_at && (formatDayTime(attempt.finished_at) || attempt.finished_at)) || ""} - ${outcome}${notes ? ` (${notes})` : ""}`;
}

export function exportedLine(count_: number, filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  return `Exported ${count(count_, "track")} to ${name}.`;
}

/**
 * A title cut into the words that differ from the group's other tracks and the rest, so
 * "Touch Me (Hotlap Remix)" lights "Hotlap Remix" (M152). The engine decides which words differ;
 * a word the title does not hold marks nothing.
 */
export function differingParts(title: string, words: readonly string[]): Array<{ text: string; differs: boolean }> {
  const lower = title.toLowerCase();
  const spans: Array<[number, number]> = [];
  for (const word of words) {
    const at = word === "" ? -1 : lower.indexOf(word.toLowerCase());
    if (at >= 0) spans.push([at, at + word.length]);
  }
  if (spans.length === 0) return [{ text: title, differs: false }];
  spans.sort((a, b) => a[0] - b[0]);
  // Overlapping or touching spans are one lit part.
  const merged: Array<[number, number]> = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  const parts: Array<{ text: string; differs: boolean }> = [];
  let cursor = 0;
  for (const [from, to] of merged) {
    if (from > cursor) parts.push({ text: title.slice(cursor, from), differs: false });
    parts.push({ text: title.slice(from, to), differs: true });
    cursor = to;
  }
  if (cursor < title.length) parts.push({ text: title.slice(cursor), differs: false });
  return parts;
}

/** "2 duplicate groups (4 tracks)": the same count wherever duplicates are counted (M155). */
export function duplicateCountLine(groups: number, tracks: number | undefined): string {
  const head = count(groups, "duplicate group");
  return tracks === undefined ? head : `${head} (${count(tracks, "track")})`;
}

export const MIXES_DIFFER_LINE = "Different mixes matched to one Beatport track: check the match";

export function trackCount(number: number): string {
  return count(number, "track");
}
