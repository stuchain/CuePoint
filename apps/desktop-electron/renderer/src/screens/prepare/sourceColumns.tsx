/**
 * The source panel's columns (PREP-11).
 *
 * The panel is narrow at the default window size, so Suggestions has two
 * columns and never scrolls sideways.
 *
 * A suggestion and a library row are library rows, so title, artist, BPM and
 * key are the Library's own cells, effective values and override marks
 * included: a track reads the same in the panel as in the Set beside it.
 *
 * **Suggestions** are Title and one short Fit column (the tempo step and the
 * track's key chip, "±0 BPM · 8A"); the reasons for each side, in playing
 * order (`inPlayOrder`), and the score out of 100 are the Fit cell's hover
 * hint, and a track already in the Set is marked on its title. The engine's
 * order is kept: nothing sorts it (DISCOVER-11's rule).
 *
 * **Library** rows sort by any column the engine sorts by, as the Library's
 * table does (LIBUI-01).
 */
import type { LibraryTrackRow, SetSuggestion, SetSuggestionSide, SetSuggestionSideName } from "../../api/cuepointBridge.types";
import { PixelIcon } from "../../components/PixelIcon";
import { KeyChip } from "../../components/wheel/KeyChip";
import type { TrackColumnDef } from "../../components/table";
import { reasonTokens, tempoDeltaText } from "../discover/reasonTokens";
import { reasonsText } from "../discover/similarColumns";
import { effectiveText } from "../library/libraryClean";
import { LIBRARY_COLUMNS } from "../library/libraryColumns";
import { fitText, inPlayOrder, inSetText } from "./prepareSource";

/** A suggestion: its library row, and what the engine said about it. */
export type SuggestionRow = LibraryTrackRow & { id: number; suggestion: SetSuggestion };

/** A library row with the id every row the engine sends has. */
type SourceLibraryRow = LibraryTrackRow;

// The second layout: Title and Fit only. A layout saved under the first key lists columns that are gone.
export const SUGGESTION_TABLE_LAYOUT_KEY = "cuepoint-prepare-suggestions-layout-2";
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

/** The tempo step a suggestion makes, from the side the list is fitted to ("±0 BPM"), or "". */
function tempoStep(row: SuggestionRow): string {
  const { before, after } = row.suggestion;
  const side = before ?? after;
  if (!side) return "";
  const name: SetSuggestionSideName = before ? "before" : "after";
  const { tempo } = reasonTokens(inPlayOrder(side.reasons, name));
  if (tempo === null) return "";
  return typeof tempo === "string" ? tempoDeltaText(tempo) : `${tempoDeltaText(tempo)} BPM`;
}

/** The full reason behind the Fit cell: the score and each side's reasons, as its hover hint. */
function fitHint(row: SuggestionRow): string {
  const { before, after, score } = row.suggestion;
  const lines = [`Fit ${fitText(score)}`];
  if (before) lines.push(`Fits after the one before: ${sideText(before, "before")} (${before.score}/100)`);
  if (after) lines.push(`Fits before the one after: ${sideText(after, "after")} (${after.score}/100)`);
  return lines.join(" · ");
}

/**
 * Suggestions are Title and one short Fit: the tempo step and the track's own key as the usual key
 * chip. The panel is a narrow column, so the reasons (and the other columns) live in the hover
 * hint and the Title's summary; nothing scrolls sideways.
 */
export const SUGGESTION_COLUMNS: readonly TrackColumnDef<SuggestionRow>[] = [
  {
    ...unsorted<SuggestionRow>(libraryColumn("title")),
    minWidthPx: 80,
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
    id: "fit",
    header: "Fit",
    hint: "How well this track fits the gap: the tempo step and its key. Hover a row for the reasons and the score out of 100.",
    minWidthPx: 96,
    defaultWidthPx: 112,
    render: (row) => {
      const step = tempoStep(row);
      return (
        <span className="prepare-source__fit" data-hint={fitHint(row)}>
          {step}
          {step && " · "}
          <KeyChip value={effectiveText(row, "key")} />
        </span>
      );
    },
    text: (row) => [tempoStep(row), effectiveText(row, "key")].filter(Boolean).join(" · "),
  },
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
