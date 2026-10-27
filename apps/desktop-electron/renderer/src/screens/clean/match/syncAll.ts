/**
 * "Sync all reviewed (3 playlists)…" (M509): one Sync for every playlist whose review is done.
 *
 * Matching three playlists used to mean three Reviews, three syncs and three undos. A playlist is
 * **reviewed** when it was matched, nothing in it waits to be checked, and its files are not
 * synced yet. The ticked tracks of all of them go to the engine as one track-id selection, so the
 * Sync window previews them once and syncs them as one job, with one undo batch. Pure.
 */
import type { BatchSelection, CleanPlaylists, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { opensDialog } from "../../../format/words";
import { plural } from "../../../format/counts";
import { playlistStatus } from "./playlistStatus";

/** The playlists whose review is done and whose files still wait for their values. */
export function reviewedPlaylists(data: CleanPlaylists | null): CleanPlaylistStatus[] {
  if (!data) return [];
  return data.playlists.filter(
    (playlist) => playlistStatus(playlist).kind === "matched" && playlist.waiting === 0 && !playlist.synced,
  );
}

/** The toolbar button: "Sync all reviewed (3 playlists)…". */
export function syncAllLabel(count: number): string {
  return opensDialog(`Sync all reviewed (${plural(count, "playlist")})`);
}

/** The Sync window's title while it reads them: "Sync 3 reviewed playlists to your files". */
export function syncAllTitle(count: number): string {
  return `Sync ${plural(count, "reviewed playlist")} to your files`;
}

/**
 * One selection of every ticked track, playlist by playlist, each track once (a track can be in
 * two playlists). Null when nothing is ticked anywhere.
 */
export function syncAllSelection(tickedPerPlaylist: readonly (readonly number[])[]): BatchSelection | null {
  const ids = [...new Set(tickedPerPlaylist.flat())];
  return ids.length === 0 ? null : { track_ids: ids };
}
