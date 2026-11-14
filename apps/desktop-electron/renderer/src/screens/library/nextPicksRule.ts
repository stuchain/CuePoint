/**
 * "Plays well next" in Track details: which of the engine's similar tracks to offer.
 *
 * Pure: no React, no bridge. The engine ranks by the Prepare rule (key on the wheel, tempo close,
 * then genre and label), so this keeps its order and only drops what is no use as a next track:
 * the track Details shows, one coming up in the queue, the one playing, and any played earlier this session.
 */
import type { LibraryTrackRow, SimilarTrack } from "../../api/cuepointBridge.types";

/** How many suggestions the section shows. */
export const NEXT_PICKS_COUNT = 3;

/** How many the engine is asked for (it allows 200), so dropping some still leaves three. */
export const NEXT_PICKS_ASK = 50;

/** How many tracks after the current one count as "already queued": the next ten, not the whole queue. */
export const NEXT_PICKS_UPCOMING = 10;

export interface NextPickExclusions {
  shownId: number | null;
  /** The upcoming tracks only (the next few after the current one), not the whole queue. */
  queuedIds: Iterable<number>;
  playingId: number | null;
  playedIds: Iterable<number>;
}

/**
 * Every suggestion still worth offering, in the engine's order. The caller takes the first
 * `NEXT_PICKS_COUNT` that it can read a row for, so rows are read lazily.
 */
export function eligibleNextTracks(suggestions: readonly SimilarTrack[], exclusions: NextPickExclusions): SimilarTrack[] {
  const skip = new Set<number>([...exclusions.queuedIds, ...exclusions.playedIds]);
  if (exclusions.shownId != null) skip.add(exclusions.shownId);
  if (exclusions.playingId != null) skip.add(exclusions.playingId);
  const eligible: SimilarTrack[] = [];
  for (const suggestion of suggestions) {
    if (skip.has(suggestion.track_id)) continue;
    skip.add(suggestion.track_id);
    eligible.push(suggestion);
  }
  return eligible;
}

/** The BPM to show and to rank by: the effective one (a typed or tag value), else Rekordbox's. */
export function effectiveBpm(track: Pick<LibraryTrackRow, "bpm" | "effective_bpm">): number | null {
  return track.effective_bpm ?? track.bpm ?? null;
}

/**
 * The section needs a key or a BPM: its picks are about mixing, and a track with neither has
 * nothing to mix by.
 */
export function hasKeyOrBpm(track: Pick<LibraryTrackRow, "effective_key" | "bpm" | "effective_bpm">): boolean {
  const key = (track.effective_key ?? "").trim();
  const bpm = effectiveBpm(track);
  return key !== "" || (bpm != null && bpm > 0);
}
