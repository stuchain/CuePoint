/**
 * The source panel's columns (PREP-11).
 *
 * The panel is narrow at the default window size, so Suggestions has three
 * short columns and never scrolls sideways.
 *
 * A suggestion and a library row are library rows, so title, artist, BPM and
 * key are the Library's own cells, effective values and override marks
 * included: a track reads the same in the panel as in the Set beside it.
 *
 * **Suggestions** are Title, the normal Key chip column and a right-aligned **BPM Δ** (the
 * tempo step, signed, in tabular figures: C78, C70). The reasons for each side, in playing order
 * (`inPlayOrder`), and the score out of 100 are the BPM Δ cell's hover hint, and a track already
 * in the Set is marked on its title. The engine's order is kept until a heading is clicked:
 * Key and BPM Δ sort the loaded rows on screen, and the last sort is remembered (C193); the
 * engine is never asked for them.
 *
 * **Library** rows sort by any column the engine sorts by, as the Library's
 * table does (LIBUI-01).
 */
import type { LibraryTrackRow, SetSuggestion, SetSuggestionSide, SetSuggestionSideName } from "../../api/cuepointBridge.types";
import { PixelIcon } from "../../components/PixelIcon";
import { camelotOf } from "../../components/wheel/keyColour";
import { parseCode } from "../../components/wheel/camelot";
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

// The third layout: Title, Key and BPM Δ. A layout saved under an earlier key lists a Fit column that is gone.
export const SUGGESTION_TABLE_LAYOUT_KEY = "cuepoint-prepare-suggestions-layout-3";
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

/** What Suggestions are ranked by: the BPM Δ header's hint, where the one-time note used to be (C203). */
export const SUGGESTIONS_RANKING_TITLE =
  "Ranked by how well each track follows the one before and leads into the one after: tempo, key, genre, label and artist.";

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

/** The tempo step a suggestion makes, from the side the list is fitted to, or null. */
function tempoOf(row: SuggestionRow): ReturnType<typeof reasonTokens>["tempo"] {
  const { before, after } = row.suggestion;
  const side = before ?? after;
  if (!side) return null;
  const name: SetSuggestionSideName = before ? "before" : "after";
  return reasonTokens(inPlayOrder(side.reasons, name)).tempo;
}

/** The tempo step as the BPM Δ cell says it: "+1", "−2", "±0", "0.5×", or "". */
function tempoStep(row: SuggestionRow): string {
  return tempoDeltaText(tempoOf(row));
}

/** Where a key sits on the wheel as one number, so Key sorts around the wheel and A before B (C193). */
function keyOrder(row: SuggestionRow): number | null {
  const place = parseCode(camelotOf(effectiveText(row, "key")) ?? "");
  return place ? place.number * 2 + (place.letter === "B" ? 1 : 0) : null;
}

/** The full reason behind the BPM Δ cell: the score and each side's reasons, as its hover hint. */
function fitHint(row: SuggestionRow): string {
  const { before, after, score } = row.suggestion;
  const lines = [`Fit ${fitText(score)}`];
  if (before) lines.push(`Fits after the one before: ${sideText(before, "before")} (${before.score}/100)`);
  if (after) lines.push(`Fits before the one after: ${sideText(after, "after")} (${after.score}/100)`);
  return lines.join(" · ");
}

/**
 * Suggestions are Title, the track's own key as the usual key chip, and the tempo step as a
 * right-aligned BPM Δ. The panel is a narrow column, so the reasons live in the hover hint and the
 * Title's summary; nothing scrolls sideways.
 */
export const SUGGESTION_COLUMNS: readonly TrackColumnDef<SuggestionRow>[] = [
  {
    ...unsorted<SuggestionRow>(libraryColumn("title")),
    minWidthPx: 80,
    defaultWidthPx: 150,
    render: (row) => {
      const inSet = inSetText(row.suggestion.in_set);
      return (
        <span className="prepare-source__title" data-hint={suggestionSummary(row)}>
          {inSet && (
            <span className="prepare-source__in-set" data-hint={inSet} aria-label={inSet}>
              <PixelIcon name="repeat-after" className="cp-pixel-icon--text cp-pixel-icon--before" />
            </span>
          )}
          <span className="track-table__cell-text" data-cut-hint="">
            {row.title}
          </span>
        </span>
      );
    },
    text: (row) => row.title,
  },
  {
    ...unsorted<SuggestionRow>(libraryColumn("key")),
    accessor: keyOrder,
  },
  {
    id: "bpm_delta",
    header: "BPM Δ",
    hint: `The tempo step from the neighbor, in playing order: −2, +3 or ±0, and a mark for half or double. ${SUGGESTIONS_RANKING_TITLE} Hover a row for the reasons and the score out of 100.`,
    minWidthPx: 56,
    defaultWidthPx: 64,
    align: "right",
    accessor: (row) => {
      const tempo = tempoOf(row);
      return tempo !== null && typeof tempo !== "string" ? tempo.delta : null;
    },
    render: (row) => {
      const step = tempoStep(row);
      return (
        <span className="prepare-source__delta" data-hint={fitHint(row)}>
          {step}
        </span>
      );
    },
    text: tempoStep,
  },
];

export const SOURCE_LIBRARY_COLUMNS: readonly TrackColumnDef<SourceLibraryRow>[] = [
  { ...libraryColumn("title"), defaultWidthPx: 170 },
  libraryColumn("key"),
  libraryColumn("bpm"),
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
