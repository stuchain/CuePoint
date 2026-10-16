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
 * **Suggestions** add the fit, out of 100, drawn as a bar, and each side's
 * reasons as short tokens, "+1 · −2 · G" (R4-8; DEC-105 lists them per side,
 * so a list that suits one neighbour better says so), and mark a track already
 * in the Set. Both cells read in playing order: on "Fits before" the
 * candidate plays first, so its key and tempo are turned round from the
 * engine's neighbour-to-candidate (`inPlayOrder`). The sentence a token run stands for, from
 * `describeSimilarReason`, is the cell's hint, and the copied text keeps it
 * too. The engine's order is kept: nothing sorts it (DISCOVER-11's rule).
 *
 * **Library** rows sort by any column the engine sorts by, as the Library's
 * table does (LIBUI-01).
 */
import type { LibraryTrackRow, SetSuggestion, SetSuggestionSide, SetSuggestionSideName } from "../../api/cuepointBridge.types";
import { PixelIcon } from "../../components/PixelIcon";
import type { TrackColumnDef } from "../../components/table";
import { FitBar } from "../../components/charts/FitBar";
import { reasonTokens, tokenRun } from "../discover/reasonTokens";
import { reasonsText } from "../discover/similarColumns";
import { LIBRARY_COLUMNS } from "../library/libraryColumns";
import { fitText, inPlayOrder, inSetText } from "./prepareSource";

/** A suggestion: its library row, and what the engine said about it. */
export type SuggestionRow = LibraryTrackRow & { id: number; suggestion: SetSuggestion };

/** A library row with the id every row the engine sends has. */
type SourceLibraryRow = LibraryTrackRow;

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

/** One side's reasons as a sentence: the hint, the copied text and the hint. */
function sideText(side: SetSuggestionSide | null, name: SetSuggestionSideName): string {
  if (!side) return "";
  return side.reasons.length > 0 ? reasonsText(inPlayOrder(side.reasons, name)) : "Nothing in common";
}

/** One side's reasons as the cell draws them: the token run, the sentence in its hint. */
function sideCell(side: SetSuggestionSide | null, name: SetSuggestionSideName) {
  const text = sideText(side, name);
  if (!side || !text) return "";
  const run = tokenRun(reasonTokens(inPlayOrder(side.reasons, name))) || text;
  return <span data-hint={`${text} (${side.score}/100)`}>{run}</span>;
}

/**
 * Everything a suggestion's row says, as its hint: at the default
 * window the panel is about one column wide, and the reasons are what a
 * suggestion is read for.
 */
function suggestionSummary(row: SuggestionRow): string {
  const { before, after, score, in_set: inSet } = row.suggestion;
  const lines = [`${row.title} · fit ${fitText(score)}`];
  if (before) lines.push(`Fits after the one before: ${sideText(before, "before")}`);
  if (after) lines.push(`Fits before the one after: ${sideText(after, "after")}`);
  const again = inSetText(inSet);
  if (again) lines.push(again);
  return lines.join(" · ");
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
        <span data-hint={suggestionSummary(row)}>
          {inSet && (
            <span className="prepare-source__in-set" data-hint={inSet} aria-label={inSet}>
              <PixelIcon name="repeat-after" className="cp-pixel-icon--text cp-pixel-icon--before" />
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
    header: "Fits after",
    hint: "How well this track follows the one before the gap: tempo, key, genre, label and artist",
    minWidthPx: 112,
    defaultWidthPx: 124,
    render: (row) => sideCell(row.suggestion.before, "before"),
    text: (row) => sideText(row.suggestion.before, "before"),
  },
  {
    id: SIDE_COLUMN.after,
    header: "Fits before",
    hint: "How well this track leads into the one after the gap: tempo, key, genre, label and artist",
    minWidthPx: 112,
    defaultWidthPx: 124,
    render: (row) => sideCell(row.suggestion.after, "after"),
    text: (row) => sideText(row.suggestion.after, "after"),
  },
  {
    id: "score",
    header: "Fit",
    hint: "How well this track fits the gap, out of 100. With a track on each side it is the mean of how well it fits after one and before the other.",
    minWidthPx: 56,
    defaultWidthPx: 68,
    align: "right",
    render: (row) => {
      const sides = [row.suggestion.before, row.suggestion.after].filter(
        (side): side is SetSuggestionSide => side !== null,
      );
      const title =
        sides.length === 2
          ? `${fitText(row.suggestion.score)}: the mean of ${sides[0].score} and ${sides[1].score}`
          : fitText(row.suggestion.score);
      return <FitBar score={row.suggestion.score} title={title} />;
    },
    text: (row) => fitText(row.suggestion.score),
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
