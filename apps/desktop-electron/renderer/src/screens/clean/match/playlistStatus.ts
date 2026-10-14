/**
 * What one row of the Playlists view says (C22, G4 §2.2).
 *
 * Pure, and kept apart from the view for `libraryFormat.ts`'s reason: the words
 * are the feature. The row says where the playlist stands with Beatport and
 * what to do next, by the first of these that applies: matching now, tracks
 * to check, values ready to save, tracks not looked up yet, and otherwise
 * done. A playlist with no tracks says so and offers nothing.
 *
 * Every playlist has its own **Match** button (no ticks, no header button), so
 * the status only says what else the row offers: **Review N ›** while tracks
 * wait for a yes or no, **Save N to files…** while values are ready, and a
 * **Stop** while it is being matched.
 */
import type { CleanPlaylistCounts } from "../../../api/cuepointBridge.types";

/** Which colour class a chip takes (`.cp-status--*`): what to do, what is wrong, what is done. */
export type PlaylistTone = "action" | "problem" | "done" | "none";

export type PlaylistStatusKind =
  | "running"
  | "waiting"
  | "unsaved"
  | "not_matched"
  | "done"
  | "empty";

export interface PlaylistChip {
  text: string;
  tone: PlaylistTone;
}

export interface PlaylistStatus {
  kind: PlaylistStatusKind;
  /** The Beatport column's words: the first chip's, or the running line. */
  text: string;
  tone: PlaylistTone;
  /** The Beatport column's chips: "9 to check" and "15 confirmed" for a matched playlist. */
  chips: PlaylistChip[];
  /** How far a running match is; the row draws a bar and says "Matching 12 of 24". */
  running: { jobId: string; done: number; total: number } | null;
  /** Review N ›: tracks wait for a yes or no. */
  review: { label: string; count: number } | null;
  /** Save N to files…: values are ready to go into the files. */
  save: { label: string; count: number } | null;
  /** Whether the row has a Match button: not for an empty playlist, nor while it is matched. */
  canMatch: boolean;
  /** Words in the Next column when there is nothing to press. */
  note: string | null;
}

export function playlistStatus(counts: CleanPlaylistCounts): PlaylistStatus {
  const { running, waiting, accepted, unsaved, not_matched: notMatched, track_count: tracks } = counts;
  const review = waiting > 0 ? { label: `Review ${waiting.toLocaleString()} ›`, count: waiting } : null;
  const save =
    unsaved > 0 ? { label: `Save ${unsaved.toLocaleString()} to files…`, count: unsaved } : null;
  const base = { review, save, canMatch: true, note: null, running: null };

  if (tracks === 0 && !running) {
    return {
      ...base,
      kind: "empty",
      text: "Empty",
      tone: "none",
      chips: [{ text: "Empty", tone: "none" }],
      review: null,
      save: null,
      canMatch: false,
    };
  }
  if (running) {
    const text = `Matching ${running.done.toLocaleString()} of ${running.total.toLocaleString()}`;
    return {
      ...base,
      kind: "running",
      text,
      tone: "none",
      chips: [],
      running: { jobId: running.job_id, done: running.done, total: running.total },
      review: null,
      save: null,
      canMatch: false,
    };
  }
  if (waiting > 0) {
    const chips: PlaylistChip[] = [{ text: `${waiting.toLocaleString()} to check`, tone: "action" }];
    if (accepted > 0) chips.push({ text: `${accepted.toLocaleString()} confirmed`, tone: "done" });
    return { ...base, kind: "waiting", text: chips[0]!.text, tone: "action", chips };
  }
  if (unsaved > 0) {
    const text = `${unsaved.toLocaleString()} ready to save`;
    return { ...base, kind: "unsaved", text, tone: "action", chips: [{ text, tone: "action" }] };
  }
  if (notMatched > 0) {
    const text = notMatched === tracks ? "Not matched" : `${notMatched.toLocaleString()} not matched`;
    return { ...base, kind: "not_matched", text, tone: "problem", chips: [{ text, tone: "problem" }] };
  }
  return {
    ...base,
    kind: "done",
    text: "Done",
    tone: "done",
    chips: [{ text: "Done", tone: "done" }],
    note: "Values in your files",
  };
}
