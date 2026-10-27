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
import type { ReactNode } from "react";
import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../components/table";
import { camelotOf } from "../../components/wheel/keyColour";
import { fileStatusLabel } from "../clean/cleanFormat";
import { matchCell } from "../clean/cleanColumns";
import { starsFor } from "./filterText";
import { RatingStars } from "./RatingStars";
import { artworkText, effectiveText, formatScore } from "./libraryClean";
import { OverriddenValue, RowArtwork, RowLoudness, RowWaveform } from "./libraryCells";
import { gatherLoudnessText } from "./libraryLoudness";
import { matchedLabel } from "./searchMatch";
import { formatDuration } from "./trackValues";
import { PixelIcon } from "../../components/PixelIcon";

/**
 * A row as the table may draw it: `just_saved` is the page's own mark, for a rating or a favorite
 * set from a menu a moment ago (M382). The engine never sends it.
 */
export type ShownTrackRow = LibraryTrackRow & { just_saved?: boolean };

/** The tick by the title of a row whose rating or favorite was just set (M382, D-optimistic). */
function savedTick(track: LibraryTrackRow) {
  return (track as ShownTrackRow).just_saved ? (
    <span className="library-saved" role="status">
      <PixelIcon name="check" size="sm" />
      <span className="cp-visually-hidden">Saved</span>
    </span>
  ) : null;
}

/**
 * Stars, not a number — the parser converted Rekordbox's 0/51/…/255 encoding
 * at import (LIBRARY-02), so the stored value is already a star count. The earned stars are
 * drawn filled and the rest outlined (C104); a track with no rating, or rated zero, is blank:
 * 185 dashes down a column say nothing ("unrated" is only a filter's word, M94, D12).
 */
function formatRating(rating: number | null): ReactNode {
  return rating == null || Math.round(rating) <= 0 ? "" : <RatingStars count={rating} />;
}

/**
 * Genre's cell (M95): the primary genre the engine names, falling back to the whole value, and every
 * genre in a hint when the value names more than one.
 */
function genreShown(track: LibraryTrackRow): { shown?: string; hint?: string } {
  const primary = track.genre_primary?.trim();
  const all = (track.genres ?? []).filter((genre) => genre.trim() !== "");
  return {
    shown: primary ? primary : undefined,
    hint: all.length > 1 ? all.join(", ") : undefined,
  };
}

/** The rating as words, for a copied cell: "3 stars", or nothing when there is none. */
function ratingText(rating: number | null): string {
  return rating == null || Math.round(rating) <= 0 ? "" : starsFor(rating);
}

/**
 * The least a short number or key column is drawn at, before scale (M88): its heading's words plus
 * the sort arrow, the gap between them and the heading's own padding (`--space-lg` on the arrow's
 * side, `--space-sm` on the other), so a narrow pane cuts no heading to "Leng" or "Ke". Worked at
 * 0.5em a Pixelify Sans glyph at the 10.5 px label size ("Length" draws about 31 px):
 * Key 12 + 6 + 4 + 16 + 6 = 44, BPM 12 + 6 + 4 + 16 + 6 = 44, Length 12 + 6 + 4 + 32 + 6 = 60.
 * 60, not more: the opening columns must still fit the default window (M85's guard).
 * Prepare's side panel and the Keys tracks pane use these columns too.
 */
export const HEADING_MIN_PX = { bpm: 56, key: 56, duration_seconds: 60 } as const;

/*
 * One default order across the pages (D12): Title, Artist, BPM, Key, Length, then the extras. The
 * opening set is the six that fit the default window with nothing scrolling (M85: Label, Rating and
 * Album wait in the Columns list; Title and Artist shrink first when the room is short).
 */
export const LIBRARY_COLUMNS: readonly TrackColumnDef<LibraryTrackRow>[] = [
  {
    id: "title",
    header: "Title",
    sortKey: "title",
    minWidthPx: 120,
    defaultWidthPx: 220,
    sticky: true,
    // A row a search found by its key or tempo says so beside its title (FLW-5).
    render: (track) => {
      const matched = matchedLabel(track);
      const tick = savedTick(track);
      return matched ? (
        <>
          {track.title} <span className="library-matched">{matched}</span>
          {tick}
        </>
      ) : tick ? (
        <>
          {track.title}
          {tick}
        </>
      ) : (
        track.title
      );
    },
    text: (track) => track.title,
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
    render: (track) => track.remixer ?? null,
  },
  {
    id: "bpm",
    header: "BPM",
    sortKey: "bpm",
    minWidthPx: HEADING_MIN_PX.bpm,
    defaultWidthPx: 72,
    align: "right",
    render: (track) => <OverriddenValue row={track} field="bpm" />,
    text: (track) => effectiveText(track, "bpm"),
  },
  {
    id: "key",
    header: "Key",
    chips: true,
    // An empty cell is a dash; this is why (DEC-201).
    hint: "Keys come from Beatport matches",
    sortKey: "key",
    minWidthPx: HEADING_MIN_PX.key,
    defaultWidthPx: 70,
    render: (track) => <OverriddenValue row={track} field="key" />,
    text: (track) => {
      const key = effectiveText(track, "key");
      return camelotOf(key) ?? key;
    },
  },
  {
    id: "duration_seconds",
    header: "Length",
    sortKey: "duration_seconds",
    minWidthPx: HEADING_MIN_PX.duration_seconds,
    defaultWidthPx: 76,
    align: "right",
    render: (track) => formatDuration(track.duration_seconds) || null,
  },
  {
    id: "genre",
    header: "Genre",
    sortKey: "genre",
    minWidthPx: 90,
    defaultWidthPx: 130,
    // M95: the first genre, with every genre in the hint when there are more; the mark stays.
    render: (track) => <OverriddenValue row={track} field="genre" {...genreShown(track)} />,
    text: (track) => effectiveText(track, "genre"),
  },
  {
    id: "label",
    hiddenByDefault: true,
    header: "Label",
    sortKey: "label",
    minWidthPx: 90,
    defaultWidthPx: 140,
    render: (track) => <OverriddenValue row={track} field="label" />,
    text: (track) => effectiveText(track, "label"),
  },
  {
    id: "rating",
    hiddenByDefault: true,
    header: "Rating",
    sortKey: "rating",
    minWidthPx: 70,
    defaultWidthPx: 92,
    // "" and not null: null is a missing value, which the table draws as a dash (M94).
    render: (track) => formatRating(track.effective_rating) || "",
    text: (track) => ratingText(track.effective_rating),
  },
  {
    id: "album",
    hiddenByDefault: true,
    header: "Album",
    sortKey: "album",
    minWidthPx: 100,
    defaultWidthPx: 170,
    render: (track) => track.album ?? null,
  },
  {
    id: "year",
    hiddenByDefault: true,
    header: "Year",
    sortKey: "year",
    minWidthPx: 56,
    defaultWidthPx: 72,
    align: "right",
    render: (track) => <OverriddenValue row={track} field="year" />,
    text: (track) => effectiveText(track, "year"),
  },
  {
    id: "play_count",
    hiddenByDefault: true,
    header: "Plays",
    sortKey: "play_count",
    minWidthPx: 56,
    defaultWidthPx: 72,
    align: "right",
    render: (track) => (track.play_count == null ? null : String(track.play_count)),
  },
  {
    id: "date_added",
    hiddenByDefault: true,
    header: "Added",
    sortKey: "date_added",
    minWidthPx: 90,
    defaultWidthPx: 110,
    render: (track) => track.date_added ?? null,
  },
  {
    id: "colour",
    hiddenByDefault: true,
    header: "Color",
    minWidthPx: 70,
    defaultWidthPx: 90,
    render: (track) => track.colour ?? null,
  },
  {
    id: "bitrate",
    hiddenByDefault: true,
    header: "Bitrate",
    sortKey: "bitrate",
    minWidthPx: 60,
    defaultWidthPx: 82,
    align: "right",
    render: (track) => (track.bitrate == null ? null : String(track.bitrate)),
  },
  {
    id: "comment",
    hiddenByDefault: true,
    header: "Comment",
    minWidthPx: 100,
    defaultWidthPx: 180,
    render: (track) => track.comment ?? null,
  },
  {
    id: "file_path",
    hiddenByDefault: true,
    header: "File",
    minWidthPx: 120,
    defaultWidthPx: 240,
    render: (track) => track.file_path,
  },
  // Clean (CLEAN-13): hidden until asked for, like every column past the
  // ones a DJ reads. Each sorts by the engine's own name for it.
  {
    id: "match_state",
    hiddenByDefault: true,
    header: "Match",
    sortKey: "match_state",
    minWidthPx: 90,
    defaultWidthPx: 150,
    render: matchCell,
  },
  {
    id: "match_score",
    hiddenByDefault: true,
    header: "Score",
    sortKey: "match_score",
    minWidthPx: 56,
    defaultWidthPx: 72,
    align: "right",
    render: (track) => formatScore(track.match_score) || null,
  },
  {
    id: "file_status",
    hiddenByDefault: true,
    header: "File status",
    sortKey: "file_status",
    minWidthPx: 80,
    defaultWidthPx: 110,
    render: (track) => fileStatusLabel(track.file_status) || null,
  },
  {
    id: "artwork",
    hiddenByDefault: true,
    header: "Artwork",
    minWidthPx: 56,
    defaultWidthPx: 64,
    render: (track) => <RowArtwork row={track} />,
    text: (track) => artworkText(track.artwork),
  },
  // WAVE-06: hidden until asked for, so the table opens on the rows it did.
  // Not sortable, and nothing to copy: a picture has no text.
  {
    id: "waveform",
    hiddenByDefault: true,
    header: "Waveform",
    minWidthPx: 48,
    defaultWidthPx: 120,
    render: (track) => <RowWaveform row={track} />,
    text: () => "",
  },
  // WAVE-08: measured with the waveform, shown, never applied (DEC-124).
  // Hidden until asked for. Not sortable: the value lives in the waveform
  // store, and the Library's query reads the library database. A copy reads
  // each row's value with its unit, "−8.4 LUFS".
  {
    id: "loudness",
    hiddenByDefault: true,
    header: "Loudness",
    minWidthPx: 48,
    defaultWidthPx: 72,
    align: "right",
    render: (track) => <RowLoudness row={track} />,
    text: () => "",
    gatherText: gatherLoudnessText,
  },
];

/**
 * The column order before D12's one default order (BPM before Key), every id as it was declared,
 * hidden ones included. Every current user may already have a saved layout, so a new default order
 * alone would reach nobody. A saved layout whose order still equals this one has never been
 * rearranged, and `reconcileLayout` moves it to the order above once, keeping widths and hidden
 * flags; a layout the person reordered is left alone. Once moved, the saved order is the new
 * default and never matches this again. (The order before DEC-NEW-K1 is no longer moved: a layout
 * still in it was last changed before that release and keeps its order.)
 */
export const LIBRARY_PREVIOUS_DEFAULT_ORDER: readonly string[] = [
  "title",
  "artist",
  "remixer",
  "key",
  "bpm",
  "duration_seconds",
  "genre",
  "label",
  "rating",
  "album",
  "year",
  "play_count",
  "date_added",
  "colour",
  "bitrate",
  "comment",
  "file_path",
  "match_state",
  "match_score",
  "file_status",
  "artwork",
  "waveform",
  "loudness",
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
