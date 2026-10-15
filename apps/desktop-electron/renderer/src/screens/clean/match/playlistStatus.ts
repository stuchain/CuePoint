/**
 * What one row of the Playlists view says (C22).
 *
 * Pure, and kept apart from the view because the words are the feature. The row says where the
 * playlist stands with Beatport: matching now, empty, not matched yet, or matched, with how many
 * tracks have a match and how many were not found. A matched row offers **Review**; the Match
 * button is the page's one, over the ticked rows, so a row has no button of its own for it.
 */
import type { CleanPlaylistCounts } from "../../../api/cuepointBridge.types";

/** Which colour class a chip takes (`.cp-status--*`): what is wrong, what is done. */
export type PlaylistTone = "problem" | "done" | "none";

export type PlaylistStatusKind = "running" | "empty" | "not_matched" | "matched";

export interface PlaylistChip {
  text: string;
  tone: PlaylistTone;
}

export interface PlaylistStatus {
  kind: PlaylistStatusKind;
  /** The Status column's chips. */
  chips: PlaylistChip[];
  /** How far a running match is; the row draws a bar and says "Matching 12 of 24". */
  running: { jobId: string; done: number; total: number } | null;
  /** The running line's words. */
  text: string;
  /** Whether the row has something to review: some track has been looked up. */
  canReview: boolean;
  /** Whether the row can be ticked for Match: not an empty playlist, nor one being matched. */
  canTick: boolean;
}

export function playlistStatus(counts: CleanPlaylistCounts): PlaylistStatus {
  const { running, accepted, waiting, rejected, no_match: noMatch, not_matched: notMatched, track_count: tracks } = counts;
  const base = { running: null, text: "", canReview: false, canTick: true };
  if (running) {
    const text = `Matching ${running.done.toLocaleString()} of ${running.total.toLocaleString()}`;
    return {
      ...base,
      kind: "running",
      text,
      chips: [],
      running: { jobId: running.job_id, done: running.done, total: running.total },
      canTick: false,
    };
  }
  if (tracks === 0) {
    return { ...base, kind: "empty", chips: [{ text: "Empty", tone: "none" }], canTick: false };
  }
  const found = accepted + waiting + rejected;
  if (found === 0 && noMatch === 0) {
    return { ...base, kind: "not_matched", chips: [{ text: "Not matched yet", tone: "none" }] };
  }
  const chips: PlaylistChip[] = [];
  if (found > 0) chips.push({ text: `Matched · ${found.toLocaleString()}`, tone: "done" });
  if (noMatch > 0) chips.push({ text: `${noMatch.toLocaleString()} not found`, tone: "problem" });
  if (notMatched > 0) chips.push({ text: `${notMatched.toLocaleString()} not matched yet`, tone: "none" });
  return { ...base, kind: "matched", chips, canReview: true };
}
