/**
 * What the header's **Match N playlists on Beatport** says and sends (C22).
 *
 * Pure: the button's words (and whether it is a rematch), the selection the
 * engine is asked to match, and the name the run is kept under in Past
 * searches. The whole library, ticked, is every track and the only row ticked
 * (`usePlaylistTicks`); it says "the whole library" rather than a count, and
 * rematches only by its own `not_matched`.
 */
import type { BatchSelection } from "../../../api/cuepointBridge.types";
import { sourcesQuery } from "../cleanTracks";
import { WHOLE_LIBRARY_NAME, type TickedPlaylist } from "./useCleanPlaylists";

/** "1 playlist", "2 playlists". */
function playlistCount(count: number): string {
  return `${count.toLocaleString()} playlist${count === 1 ? "" : "s"}`;
}

/** The button's label, and whether pressing it looks the tracks up again. */
export function matchPlaylistsAction(ticked: readonly TickedPlaylist[]): { label: string; again: boolean } {
  if (ticked.length === 0) return { label: "Match playlists on Beatport", again: false };
  // The whole library is every playlist at once, and the only row ticked then.
  if (ticked.some((row) => row.id === null)) {
    const again = ticked.every((row) => row.counts.not_matched === 0);
    return { label: again ? "Match the whole library again" : "Match the whole library on Beatport", again };
  }
  // Every ticked row has nothing left to look up: this is a rematch.
  const again = ticked.every((row) => row.counts.not_matched === 0);
  const words = playlistCount(ticked.length);
  return { label: again ? `Match ${words} again` : `Match ${words} on Beatport`, again };
}

/** The tracks to match: the whole library as the empty question, else the ticked playlists. */
export function matchPlaylistsSelection(ticked: readonly TickedPlaylist[]): BatchSelection {
  if (ticked.some((row) => row.id === null)) return { query: {} };
  return {
    query: sourcesQuery(ticked.map((row) => ({ kind: "playlist" as const, id: row.id as number }))),
  };
}

/** The run's name: up to three names, then "and N more"; "Whole library" when that is ticked. */
export function matchPlaylistsLabel(ticked: readonly TickedPlaylist[]): string {
  if (ticked.some((row) => row.id === null)) return WHOLE_LIBRARY_NAME;
  const names = ticked.map((row) => row.name);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}
