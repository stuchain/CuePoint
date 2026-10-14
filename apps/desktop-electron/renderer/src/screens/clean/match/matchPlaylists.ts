/**
 * What a playlist's **Match** button sends (C22).
 *
 * Pure: the selection the engine is asked to match, whether it is a rematch, and
 * the name the run is kept under in Past searches. A row is one playlist, or the
 * whole library (`playlist` null), which is every track and rematches only by its
 * own `not_matched`.
 */
import type { BatchSelection, CleanPlaylistCounts, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { sourcesQuery } from "../cleanTracks";
import { WHOLE_LIBRARY_NAME } from "./useCleanPlaylists";

/** What one press of Match asks for. */
export interface MatchRowRequest {
  selection: BatchSelection;
  /** True when nothing is left to look up: the press searches the tracks again. */
  again: boolean;
  /** The run's name in Past searches and on the row's notice. */
  label: string;
}

/** The request for a row: a playlist, or the whole library when `playlist` is null. */
export function matchRowRequest(
  playlist: CleanPlaylistStatus | null,
  whole: CleanPlaylistCounts,
): MatchRowRequest {
  const counts = playlist ?? whole;
  const again = counts.not_matched === 0;
  if (playlist === null) return { selection: { query: {} }, again, label: WHOLE_LIBRARY_NAME };
  return {
    selection: { query: sourcesQuery([{ kind: "playlist", id: playlist.id }]) },
    again,
    label: playlist.name,
  };
}
