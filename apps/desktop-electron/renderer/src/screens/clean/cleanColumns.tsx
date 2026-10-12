/**
 * The Clean page's tables' columns (CLEAN-12).
 *
 * Library rows, drawn for a different job: Missing files leads with where a
 * file was expected. (The Match table's columns are `match/matchColumns.tsx`.)
 * Each table keeps its own layout, so widening a column here does not rearrange the
 * Library (DEC-042). A column sorts by the engine's own sort names, as the
 * Library's do, and one the engine cannot order by has no `sortKey`.
 */
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../components/table";
import { fileStatusHint, fileStatusLabel, matchStateLabel } from "./cleanFormat";

export const MISSING_TABLE_LAYOUT_KEY = "cuepoint-clean-missing-table-layout";

const title: TrackColumnDef<LibraryTrackRow> = {
  id: "title",
  header: "Title",
  sortKey: "title",
  minWidthPx: 120,
  defaultWidthPx: 220,
  sticky: true,
  render: (track) => track.title,
};

const artist: TrackColumnDef<LibraryTrackRow> = {
  id: "artist",
  header: "Artist",
  sortKey: "artist",
  minWidthPx: 100,
  defaultWidthPx: 170,
  render: (track) => track.artist,
};

/** Where a track stands, and when a newer match disagrees: the Library's Match column reads it too. */
export function matchCell(track: LibraryTrackRow): string {
  const label = matchStateLabel(track.match_state);
  return track.match_disputed ? `${label} · changed since you decided` : label;
}

export const MISSING_COLUMNS: readonly TrackColumnDef<LibraryTrackRow>[] = [
  title,
  artist,
  {
    id: "file_status",
    header: "File",
    hint: `Missing: ${fileStatusHint("missing")}. Unreadable: ${fileStatusHint("unreadable")}.`,
    minWidthPx: 80,
    defaultWidthPx: 100,
    render: (track) => fileStatusLabel(track.file_status),
  },
  {
    id: "file_path",
    header: "Expected at",
    minWidthPx: 160,
    defaultWidthPx: 420,
    render: (track) => track.file_path,
  },
  {
    id: "album",
    hiddenByDefault: true,
    header: "Album",
    sortKey: "album",
    minWidthPx: 100,
    defaultWidthPx: 170,
    render: (track) => track.album ?? "",
  },
];
