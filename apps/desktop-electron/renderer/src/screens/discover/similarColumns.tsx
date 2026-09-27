/**
 * Similar tracks' columns (DISCOVER-11, DEC-096).
 *
 * A suggestion is a library row, so it has the Library's columns, and two of
 * its own after the title: its score, and a **Reasons** column that says in
 * words why it scored — "Same key", "One step on the wheel: 8A → 9A", "Half
 * time: 128 → 64" — from DISCOVER-08's reasons, through `describeSimilarReason`.
 * A suggestion that says why can be discounted; one that does not can only be
 * distrusted.
 *
 * The list is in the engine's order, best first then by id, so no column
 * sorts it: a sorted suggestion list is a list of something else.
 */
import type {
  LibraryTrackRow,
  SimilarReason,
  SimilarTrack,
} from "../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../components/table";
import { LIBRARY_COLUMNS } from "../library/libraryColumns";
import { describeSimilarReason } from "./similarReasons";

/** A suggestion: its library row, and what the engine said about it. */
export type SimilarRow = LibraryTrackRow & { id: number; suggestion: SimilarTrack };

export const SIMILAR_TABLE_LAYOUT_KEY = "cuepoint-discover-similar-layout";

/** Every reason a suggestion scored, in the engine's order, as one line. */
export function reasonsText(reasons: readonly SimilarReason[]): string {
  return reasons.map(describeSimilarReason).join(" · ");
}

function unsorted(
  column: TrackColumnDef<LibraryTrackRow>,
): TrackColumnDef<SimilarRow> {
  const { sortKey: _engineOrder, ...rest } = column;
  return rest;
}

const [TITLE, ...REST] = LIBRARY_COLUMNS;

/**
 * The title, then the reasons beside it and the score after them: the reasons
 * are what this list is read for, so they sit where a narrow pane — the
 * sidebar and the Inspector open — still shows them without scrolling.
 */
export const SIMILAR_COLUMNS: readonly TrackColumnDef<SimilarRow>[] = [
  { ...unsorted(TITLE), defaultWidthPx: 180 },
  {
    id: "reasons",
    header: "Reasons",
    minWidthPx: 160,
    defaultWidthPx: 360,
    render: (row) => {
      const text = reasonsText(row.suggestion.reasons);
      return <span title={text}>{text}</span>;
    },
    text: (row) => reasonsText(row.suggestion.reasons),
  },
  {
    id: "score",
    header: "Score",
    minWidthPx: 56,
    defaultWidthPx: 64,
    align: "right",
    render: (row) => String(row.suggestion.score),
  },
  ...REST.map(unsorted),
];
