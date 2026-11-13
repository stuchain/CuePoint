/**
 * "Plays well next" in Track details: which of the engine's similar tracks to offer.
 *
 * Pure: no React, no bridge. The engine ranks by the Prepare rule (key on the wheel, tempo close,
 * then genre and label), so this keeps its order and only drops what is no use as a next track:
 * the track Details shows, one already queued, the one playing, and any played earlier this session.
 */
import type { LibraryTrackRow, SimilarTrack } from "../../api/cuepointBridge.types";

/** How many suggestions the section shows. */
export const NEXT_PICKS_COUNT = 3;

/** How many the engine is asked for, so dropping a few still leaves three. */
export const NEXT_PICKS_ASK = 12;

export interface NextPickExclusions {
  shownId: number | null;
  queuedIds: Iterable<number>;
  playingId: number | null;
  playedIds: Iterable<number>;
}

/** The first suggestions in the engine's order that are still worth offering. */
export function pickNextTracks(suggestions: readonly SimilarTrack[], exclusions: NextPickExclusions): SimilarTrack[] {
  const skip = new Set<number>([...exclusions.queuedIds, ...exclusions.playedIds]);
  if (exclusions.shownId != null) skip.add(exclusions.shownId);
  if (exclusions.playingId != null) skip.add(exclusions.playingId);
  const picks: SimilarTrack[] = [];
  for (const suggestion of suggestions) {
    if (skip.has(suggestion.track_id)) continue;
    skip.add(suggestion.track_id);
    picks.push(suggestion);
    if (picks.length === NEXT_PICKS_COUNT) break;
  }
  return picks;
}

/** The engine can rank a track only by its key or its tempo; with neither it has nothing to go on. */
export function hasKeyOrBpm(track: Pick<LibraryTrackRow, "effective_key" | "bpm">): boolean {
  const key = (track.effective_key ?? "").trim();
  return key !== "" || (track.bpm != null && track.bpm > 0);
}
