/**
 * The source panel's columns (PREP-11).
 *
 * The panel is narrow at the default window size, so a suggestion's reasons
 * sit straight after its title, where they are read without scrolling, as
 * Similar Tracks puts them (DISCOVER-11).
 *
 * A suggestion and a library row are library rows, so title, artist, BPM and
 * key are the Library's own cells, effective values and override marks
 * included: a track reads the same in the panel as in the Set beside it.
 *
 * **Suggestions** add the score and each side's reasons in words, through
 * `describeSimilarReason` (DEC-105 lists them per side, so a list that suits
 * one neighbour better says so), and mark a track already in the Set. The
 * engine's order is kept: nothing sorts it (DISCOVER-11's rule).
 *
 * **Library** rows sort by any column the engine sorts by, as the Library's
 * table does (LIBUI-01).
 */
import type { LibraryTrackRow, SetSuggestion, SetSuggestionSide } from "../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../components/table";
import { reasonsText } from "../discover/similarColumns";
import { LIBRARY_COLUMNS } from "../library/libraryColumns";
import { inSetText } from "./prepareSource";

/** A suggestion: its library row, and what the engine said about it. */
export type SuggestionRow = LibraryTrackRow & { id: number; suggestion: SetSuggestion };

/** A library row with the id every row the engine sends has. */
export type SourceLibraryRow = LibraryTrackRow;

export const SUGGESTION_TABLE_LAYOUT_KEY = "cuepoint-prepare-suggestions-layout";
export const SOURCE_LIBRARY_TABLE_LAYOUT_KEY = "cuepoint-prepare-library-layout";

function libraryColumn(id: string): TrackColumnDef<LibraryTrackRow> {
  const column = LIBRARY_COLUMNS.find((candidate) => candidate.id === id);
  if (!column) throw new Error(`The Library has no ${id} column`);
  return column;
}

function unsorted<Row extends LibraryTrackRow>(column: TrackColumnDef<LibraryTrackRow>): TrackColumnDef<Row> {
  const { sortKey: _engineOrder, ...rest } = column;
  return rest as TrackColumnDef<Row>;
}

/** One side's reasons as its cell says them. */
export function sideText(side: SetSuggestionSide | null): string {
  if (!side) return "";
  return side.reasons.length > 0 ? reasonsText(side.reasons) : "Nothing in common";
}

function sideCell(side: SetSuggestionSide | null) {
  const text = sideText(side);
  return text ? <span title={`${text} (${side?.score ?? 0})`}>{text}</span> : "";
}

/**
 * Everything a suggestion's row says, as its title's tooltip: at the default
 * window the panel is about one column wide, and the reasons are what a
 * suggestion is read for.
 */
export function suggestionSummary(row: SuggestionRow): string {
  const { before, after, score, in_set: inSet } = row.suggestion;
  const lines = [`${row.title} · score ${score}`];
  if (before) lines.push(`With the one before: ${sideText(before)}`);
  if (after) lines.push(`With the one after: ${sideText(after)}`);
  const again = inSetText(inSet);
  if (again) lines.push(again);
  return lines.join("\n");
}

/** The ids of the two reason columns, which a list fitted to one side hides. */
export const SIDE_COLUMN = { before: "before", after: "after" } as const;

export const SUGGESTION_COLUMNS: readonly TrackColumnDef<SuggestionRow>[] = [
  {
    ...unsorted<SuggestionRow>(libraryColumn("title")),
    defaultWidthPx: 150,
    render: (row) => {
      const inSet = inSetText(row.suggestion.in_set);
      return (
        <span title={suggestionSummary(row)}>
          {inSet && (
            <span className="prepare-source__in-set" title={inSet} aria-label={inSet}>
              ↻{" "}
            </span>
          )}
          {row.title}
        </span>
      );
    },
    text: (row) => row.title,
  },
  {
    id: SIDE_COLUMN.before,
    header: "With previous",
    minWidthPx: 100,
    defaultWidthPx: 200,
    render: (row) => sideCell(row.suggestion.before),
    text: (row) => sideText(row.suggestion.before),
  },
  {
    id: SIDE_COLUMN.after,
    header: "With next",
    minWidthPx: 100,
    defaultWidthPx: 200,
    render: (row) => sideCell(row.suggestion.after),
    text: (row) => sideText(row.suggestion.after),
  },
  {
    id: "score",
    header: "Score",
    minWidthPx: 48,
    defaultWidthPx: 56,
    align: "right",
    render: (row) => {
      const sides = [row.suggestion.before, row.suggestion.after].filter(
        (side): side is SetSuggestionSide => side !== null,
      );
      const title =
        sides.length === 2 ? `The mean of ${sides[0].score} and ${sides[1].score}` : undefined;
      return <span title={title}>{row.suggestion.score}</span>;
    },
    text: (row) => String(row.suggestion.score),
  },
  unsorted<SuggestionRow>(libraryColumn("bpm")),
  unsorted<SuggestionRow>(libraryColumn("key")),
  unsorted<SuggestionRow>(libraryColumn("artist")),
];

export const SOURCE_LIBRARY_COLUMNS: readonly TrackColumnDef<SourceLibraryRow>[] = [
  { ...libraryColumn("title"), defaultWidthPx: 170 },
  libraryColumn("bpm"),
  libraryColumn("key"),
  libraryColumn("artist"),
  libraryColumn("genre"),
  libraryColumn("duration_seconds"),
];

/** A suggestion as a row the table draws, or null when its track has no id. */
export function suggestionRow(suggestion: SetSuggestion): SuggestionRow | null {
  const track = suggestion.track;
  if (track.id == null) return null;
  return { ...track, id: track.id, suggestion };
}
