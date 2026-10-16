/**
 * What one row of the Playlists view offers (C22).
 *
 * Pure. The list says only what is in the user's files ("Synced Oct 14", drawn by the view from
 * the playlist's `synced`), so there is no Matched or not-found chip: where a playlist stands with
 * Beatport is for Review. This says whether a row is matching now, empty, not matched yet or
 * matched, whether it can be ticked, and whether it has something to review. The Match button is
 * the page's one, over the ticked rows, so a row has no button of its own for it.
 */
import type { CleanPlaylistCounts } from "../../../api/cuepointBridge.types";

export type PlaylistStatusKind = "running" | "queued" | "empty" | "not_matched" | "matched";

export interface PlaylistStatus {
  kind: PlaylistStatusKind;
  /** How far a running match is on this playlist's own tracks; the row draws the bar and "12 of 24". */
  running: { jobId: string; done: number; total: number } | null;
  /** The row's words while it runs ("12 of 24") or waits ("Waiting"). */
  text: string;
  /** Whether the row has something to review: some track has been looked up. */
  canReview: boolean;
  /** Whether the row can be ticked for Match: not an empty playlist, nor one being matched. */
  canTick: boolean;
}

export function playlistStatus(counts: CleanPlaylistCounts): PlaylistStatus {
  const { running, queued, accepted, waiting, rejected, no_match: noMatch, track_count: tracks } = counts;
  const base = { running: null, text: "", canReview: false, canTick: true };
  if (running) {
    const text = `${running.done.toLocaleString()} of ${running.total.toLocaleString()}`;
    return {
      ...base,
      kind: "running",
      text,
      running: { jobId: running.job_id, done: running.done, total: running.total },
      canTick: false,
    };
  }
  if (queued) {
    return { ...base, kind: "queued", text: "Waiting", canTick: false };
  }
  if (tracks === 0) {
    return { ...base, kind: "empty", canTick: false };
  }
  const found = accepted + waiting + rejected;
  if (found === 0 && noMatch === 0) {
    return { ...base, kind: "not_matched" };
  }
  return { ...base, kind: "matched", canReview: true };
}
