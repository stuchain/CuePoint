/**
 * The Library table's columns (LIBUI-10, DEC-042).
 *
 * One declaration serving three things: what the table renders, what the
 * column picker offers, and what a copy contains. A column's `sortKey` is the
 * engine's own sort name (LIBUI-01), so a header click becomes a query rather
 * than a re-render — and a column with no `sortKey` simply cannot be sorted
 * by, which is how "playlist position, outside a playlist" expresses itself
 * without the table knowing anything about playlists.
 *
 * Every field DEC-034 imported has a column. Which of them a user actually
 * sees is theirs to decide (DEC-042); the defaults are what a DJ looks at.
 */
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../components/table";
import { starsFor } from "./filterText";

/** Minutes and seconds, the way a deck shows a track length. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

/** One decimal, because 128 and 128.5 are different tracks to mix. */
export function formatBpm(bpm: number | null): string {
  return bpm == null ? "" : bpm.toFixed(1);
}

/**
 * Stars, not a number — the parser converted Rekordbox's 0/51/…/255 encoding
 * at import (LIBRARY-02), so the stored value is already a star count. A track
 * with no rating shows nothing; one rated zero shows "unrated", because those
 * are different facts (DEC-034).
 */
export function formatRating(rating: number | null): string {
  return rating == null ? "" : starsFor(rating);
}

export const LIBRARY_COLUMNS: readonly TrackColumnDef<LibraryTrackRow>[] = [
  {
    id: "title",
    header: "Title",
    sortKey: "title",
    minWidthPx: 120,
    defaultWidthPx: 220,
    sticky: true,
    render: (track) => track.title,
  },
  {
    id: "artist",
    header: "Artist",
    sortKey: "artist",
    minWidthPx: 100,
    defaultWidthPx: 170,
    render: (track) => track.artist,
  },
  {
    id: "remixer",
    hiddenByDefault: true,
    header: "Remixer",
    minWidthPx: 100,
    defaultWidthPx: 140,
    render: (track) => track.remixer ?? "",
  },
  {
    id: "album",
    header: "Album",
    sortKey: "album",
    minWidthPx: 100,
    defaultWidthPx: 170,
    render: (track) => track.album ?? "",
  },
  {
    id: "label",
    header: "Label",
    sortKey: "label",
    minWidthPx: 90,
    defaultWidthPx: 140,
    render: (track) => track.label ?? "",
  },
  {
    id: "genre",
    header: "Genre",
    sortKey: "genre",
    minWidthPx: 90,
    defaultWidthPx: 130,
    render: (track) => track.genre ?? "",
  },
  {
    id: "key",
    header: "Key",
    sortKey: "key",
    minWidthPx: 56,
    defaultWidthPx: 70,
    render: (track) => track.key ?? "",
  },
  {
    id: "bpm",
    header: "BPM",
    sortKey: "bpm",
    minWidthPx: 56,
    defaultWidthPx: 72,
    align: "right",
    render: (track) => formatBpm(track.bpm),
  },
  {
    id: "duration_seconds",
    header: "Length",
    sortKey: "duration_seconds",
    minWidthPx: 56,
    defaultWidthPx: 76,
    align: "right",
    render: (track) => formatDuration(track.duration_seconds),
  },
  {
    id: "rating",
    header: "Rating",
    sortKey: "rating",
    minWidthPx: 70,
    defaultWidthPx: 92,
    render: (track) => formatRating(track.rating),
  },
  {
    id: "year",
    hiddenByDefault: true,
    header: "Year",
    sortKey: "year",
    minWidthPx: 56,
    defaultWidthPx: 72,
    align: "right",
    render: (track) => (track.year == null ? "" : String(track.year)),
  },
  {
    id: "play_count",
    hiddenByDefault: true,
    header: "Plays",
    sortKey: "play_count",
    minWidthPx: 56,
    defaultWidthPx: 72,
    align: "right",
    render: (track) => (track.play_count == null ? "" : String(track.play_count)),
  },
  {
    id: "date_added",
    hiddenByDefault: true,
    header: "Added",
    sortKey: "date_added",
    minWidthPx: 90,
    defaultWidthPx: 110,
    render: (track) => track.date_added ?? "",
  },
  {
    id: "colour",
    hiddenByDefault: true,
    header: "Colour",
    minWidthPx: 70,
    defaultWidthPx: 90,
    render: (track) => track.colour ?? "",
  },
  {
    id: "bitrate",
    hiddenByDefault: true,
    header: "Bitrate",
    sortKey: "bitrate",
    minWidthPx: 60,
    defaultWidthPx: 82,
    align: "right",
    render: (track) => (track.bitrate == null ? "" : String(track.bitrate)),
  },
  {
    id: "comment",
    hiddenByDefault: true,
    header: "Comment",
    minWidthPx: 100,
    defaultWidthPx: 180,
    render: (track) => track.comment ?? "",
  },
  {
    id: "file_path",
    hiddenByDefault: true,
    header: "File",
    minWidthPx: 120,
    defaultWidthPx: 240,
    render: (track) => track.file_path,
  },
];

/**
 * Columns a fresh library opens on — the ones a DJ reads.
 *
 * Everything else declares `hiddenByDefault` above rather than being listed
 * here, so a column's default state lives with the column. This is derived
 * from those declarations so a test can state the opening set as a whole.
 */
export const DEFAULT_VISIBLE_COLUMNS: readonly string[] = LIBRARY_COLUMNS.filter(
  (column) => !column.hiddenByDefault,
).map((column) => column.id);
