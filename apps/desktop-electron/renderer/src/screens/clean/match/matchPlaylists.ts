/**
 * What the **Match N playlists** button sends (C22).
 *
 * Pure: the selection the engine is asked to match, whether it is a rematch, and the name the run
 * is kept under in Past searches. The ticked playlists are one run over the tracks of all of them;
 * the whole library is its own choice, every track, and excludes the playlists (they are in it).
 */
import type { BatchSelection, CleanPlaylistCounts, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { sourcesQuery } from "../cleanTracks";
import { WHOLE_LIBRARY_NAME } from "./useCleanPlaylists";

/** What one press of Match asks for. */
export interface MatchRequest {
  selection: BatchSelection;
  /** True when nothing is left to look up: the press searches the tracks again. */
  again: boolean;
  /** The run's name in Past searches and on the notice. */
  label: string;
}

/** What is ticked: the whole library, or some playlists. */
export type MatchChoice = { whole: true } | { whole: false; playlists: readonly CleanPlaylistStatus[] };

/** The request for what is ticked. */
export function matchRequest(choice: MatchChoice, whole: CleanPlaylistCounts): MatchRequest {
  if (choice.whole) {
    return { selection: { query: {} }, again: whole.not_matched === 0, label: WHOLE_LIBRARY_NAME };
  }
  const { playlists } = choice;
  return {
    selection: { query: sourcesQuery(playlists.map((playlist) => ({ kind: "playlist" as const, id: playlist.id }))) },
    again: playlists.every((playlist) => playlist.not_matched === 0),
    label: playlists.length === 1 ? playlists[0]!.name : `${playlists.length.toLocaleString()} playlists`,
  };
}

/** The Match button's words: "Match 3 playlists", "Match whole library". */
export function matchButtonLabel(choice: MatchChoice | null): string {
  if (choice === null) return "Match playlists";
  if (choice.whole) return "Match whole library";
  const count = choice.playlists.length;
  return `Match ${count.toLocaleString()} ${count === 1 ? "playlist" : "playlists"}`;
}
