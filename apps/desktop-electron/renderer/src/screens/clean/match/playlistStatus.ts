/**
 * What one row of the Playlists view says (C22, G4 §2.2).
 *
 * Pure, and kept apart from the view for `libraryFormat.ts`'s reason: the words
 * are the feature. The row says where the playlist stands with Beatport and
 * what to do next, by the first of these that applies: matching now, tracks
 * waiting for a yes or no, values ready to save, tracks not looked up yet, and
 * otherwise done. A playlist with no tracks says so and offers nothing.
 */
import type { CleanPlaylistCounts } from "../../../api/cuepointBridge.types";

/** Which colour class the status chip takes (`.cp-status--*`): what to do, what is wrong, what is done. */
export type PlaylistTone = "action" | "problem" | "done" | "none";

export type PlaylistStatusKind =
  | "running"
  | "waiting"
  | "unsaved"
  | "not_matched"
  | "done"
  | "empty";

/** The right-hand column: words, or a button the view draws. */
export type PlaylistNext =
  | { kind: "text"; text: string }
  | { kind: "review"; label: string; count: number }
  | { kind: "save"; label: string; count: number }
  | null;

export interface PlaylistStatus {
  kind: PlaylistStatusKind;
  /** The chip's words. */
  text: string;
  tone: PlaylistTone;
  next: PlaylistNext;
}

export function playlistStatus(counts: CleanPlaylistCounts): PlaylistStatus {
  const { running, waiting, unsaved, not_matched: notMatched, track_count: tracks } = counts;
  if (tracks === 0 && !running) {
    return { kind: "empty", text: "Empty", tone: "none", next: null };
  }
  if (running) {
    return {
      kind: "running",
      text: `Matching ${running.done.toLocaleString()} of ${running.total.toLocaleString()}`,
      tone: "none",
      next: { kind: "text", text: "You can keep working" },
    };
  }
  if (waiting > 0) {
    return {
      kind: "waiting",
      text: `${waiting.toLocaleString()} waiting for you`,
      tone: "action",
      next: { kind: "review", label: `Review ${waiting.toLocaleString()}`, count: waiting },
    };
  }
  if (unsaved > 0) {
    return {
      kind: "unsaved",
      text: `${unsaved.toLocaleString()} ready to save`,
      tone: "action",
      next: { kind: "save", label: `Save ${unsaved.toLocaleString()} to files…`, count: unsaved },
    };
  }
  if (notMatched > 0) {
    return {
      kind: "not_matched",
      text: notMatched === tracks ? "Not matched" : `${notMatched.toLocaleString()} not matched`,
      tone: "problem",
      next: { kind: "text", text: "Tick and press Match" },
    };
  }
  return { kind: "done", text: "Done", tone: "done", next: { kind: "text", text: "Values in your files" } };
}
