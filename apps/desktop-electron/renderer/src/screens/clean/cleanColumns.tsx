/**
 * The Clean page's tables' columns (CLEAN-12).
 *
 * Library rows, drawn for a different job: the review queue leads with where a
 * track stands, and Missing files with where its file was expected. Each table
 * keeps its own layout, so widening a column here does not rearrange the
 * Library (DEC-042). A column sorts by the engine's own sort names, as the
 * Library's do, and one the engine cannot order by has no `sortKey`.
 */
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../components/table";
import { effective, formatBpm } from "../library/libraryColumns";
import { fileStatusLabel, matchStateLabel } from "./cleanFormat";

export const REVIEW_TABLE_LAYOUT_KEY = "cuepoint-clean-review-table-layout";
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

export function matchCell(track: LibraryTrackRow): string {
  const label = matchStateLabel(track.match_state);
  return track.match_disputed ? `${label} · disputed` : label;
}

export const REVIEW_COLUMNS: readonly TrackColumnDef<LibraryTrackRow>[] = [
  title,
  artist,
  {
    id: "match_state",
    header: "Match",
    minWidthPx: 90,
    defaultWidthPx: 150,
    render: matchCell,
  },
  {
    id: "key",
    header: "Key",
    sortKey: "key",
    minWidthPx: 56,
    defaultWidthPx: 70,
    render: (track) => effective(track.effective_key, track.key) ?? "",
  },
  {
    id: "bpm",
    header: "BPM",
    sortKey: "bpm",
    minWidthPx: 56,
    defaultWidthPx: 72,
    align: "right",
    render: (track) => formatBpm(effective(track.effective_bpm, track.bpm)),
  },
  {
    id: "genre",
    header: "Genre",
    sortKey: "genre",
    minWidthPx: 90,
    defaultWidthPx: 130,
    render: (track) => effective(track.effective_genre, track.genre) ?? "",
  },
  {
    id: "label",
    header: "Label",
    sortKey: "label",
    minWidthPx: 90,
    defaultWidthPx: 140,
    render: (track) => effective(track.effective_label, track.label) ?? "",
  },
  {
    id: "year",
    hiddenByDefault: true,
    header: "Year",
    sortKey: "year",
    minWidthPx: 56,
    defaultWidthPx: 72,
    align: "right",
    render: (track) => {
      const year = effective(track.effective_year, track.year);
      return year == null ? "" : String(year);
    },
  },
];

export const MISSING_COLUMNS: readonly TrackColumnDef<LibraryTrackRow>[] = [
  title,
  artist,
  {
    id: "file_status",
    header: "File",
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
