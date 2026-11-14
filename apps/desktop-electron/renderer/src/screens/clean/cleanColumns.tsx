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
import { Badge } from "../../components/Badge";
import type { TrackColumnDef } from "../../components/table";
import { fileStatusHint, fileStatusLabel, folderName, matchStateLabel } from "./cleanFormat";

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
  return track.match_disputed ? `${label} · changed after you confirmed` : label;
}

/** Where a find in a folder (DEC-073) saw a missing track's file: shown, never relinked. */
export interface FoundFile {
  /** The file's path now. */
  path: string;
  /** The folder that was looked in. */
  folder: string;
  /** The find job that located it: "Show found file" names this and the track, never the path. */
  jobId: string;
}

/**
 * Missing files' columns. A row a find has located says "Found in <folder>" in the File column, in
 * place of "Missing", with the path as its hover; the Expected at column still says where the
 * library believes the file is, because only Rekordbox's Relocate changes that.
 */
export function missingColumns(
  found: ReadonlyMap<number, FoundFile>,
): readonly TrackColumnDef<LibraryTrackRow>[] {
  return [
    title,
    artist,
    {
      id: "file_status",
      header: "File",
      hint: `Missing: ${fileStatusHint("missing")}. Unreadable: ${fileStatusHint("unreadable")}.`,
      minWidthPx: 80,
      defaultWidthPx: 130,
      render: (track) => {
        const where = track.id == null ? undefined : found.get(track.id);
        return where ? (
          <Badge tone="success" className="clean-found-chip" title={where.path}>
            {`Found in ${folderName(where.folder)}`}
          </Badge>
        ) : (
          fileStatusLabel(track.file_status)
        );
      },
      // Copy as text says the same words the chip does.
      text: (track) => {
        const where = track.id == null ? undefined : found.get(track.id);
        return where ? `Found in ${folderName(where.folder)}` : fileStatusLabel(track.file_status);
      },
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
}

/** The columns with nothing found: the layout's defaults, and what the column picker lists. */
export const MISSING_COLUMNS: readonly TrackColumnDef<LibraryTrackRow>[] = missingColumns(new Map());
