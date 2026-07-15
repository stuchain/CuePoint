import type { TrackResult } from "../mocks/types";

/** Mirror of output_writer._get_review_indices criteria. */
export function needsReviewTrack(row: TrackResult): boolean {
  if (row.match_score != null && row.match_score < 70) return true;
  if (row.artist?.trim() && row.artist_sim != null && row.artist_sim < 50) return true;
  if (!row.matched || !row.beatport_url?.trim()) return true;
  return false;
}

export function filterReviewTracks(rows: TrackResult[]): TrackResult[] {
  return rows.filter(needsReviewTrack);
}
