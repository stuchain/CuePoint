/**
 * Similar tracks' columns (DISCOVER-11, DEC-096; R4-8, DEC-261).
 *
 * A suggestion is a library row, so it has the Library's columns, and some of
 * its own after the title, each a few characters wide and built from the
 * engine's structured reasons (`reasonTokens`): **Key** (the track's key and
 * how it relates to the seed's: "9A +1", "8A same"), **BPM Δ** ("−2", "+3",
 * "±0", "0.5×"), a ✓ each under **G**, **L** and **A** for the genre, label and artist it shares
 * with the seed, and the **Fit** as a five-step bar with the band word and
 * number in its title. A sentence ("Mixes well (next key): 8A → 9A", from
 * `describeSimilarReason`) is the hint on each reason cell, so a token is never
 * the only account of why a track is here. The copy takes each column's own
 * `text`; `reasonsText` joins the sentences for Prepare's Suggestions.
 *
 * The list is in the engine's order, best first then by id, so no column
 * sorts it: a sorted suggestion list is a list of something else. The old
 * `reasons` column id is gone; a saved layout that names it is dropped by
 * `reconcileLayout`, which ignores ids the registry does not have.
 */
import type {
  LibraryTrackRow,
  SimilarReason,
  SimilarTrack,
} from "../../api/cuepointBridge.types";
import type { TrackColumnDef } from "../../components/table";
import { FitBar } from "../../components/charts/FitBar";
import { Hint } from "../../components/Hint";
import { formatMatchScore } from "../../format/units";
import { effectiveText } from "../library/libraryClean";
import { OverriddenValue } from "../library/libraryCells";
import { LIBRARY_COLUMNS, LIBRARY_PREVIOUS_DEFAULT_ORDER } from "../library/libraryColumns";
import { reasonTokens, tempoDeltaText } from "./reasonTokens";
import { describeSimilarReason, matchWords } from "./similarReasons";

/** A suggestion: its library row, and what the engine said about it. */
export type SimilarRow = LibraryTrackRow & { id: number; suggestion: SimilarTrack };

/**
 * v2 (R4-8): the columns changed (Reasons became Key, BPM Δ, G, L, A and Fit
 * in a new order), so a saved v1 layout is left behind once, as for Prepare.
 */
export const SIMILAR_TABLE_LAYOUT_KEY = "cuepoint-discover-similar-layout-v2";

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

/** The sentence for one component's reasons, or "" when the suggestion has none of it. */
function sentenceFor(row: SimilarRow, component: SimilarReason["component"]): string {
  return row.suggestion.reasons
    .filter((reason) => reason.component === component)
    .map(describeSimilarReason)
    .join(" · ");
}

/** "9A +1": the key as the Library shows it, then its relation to the seed's, if any. */
function keyText(row: SimilarRow): string {
  const key = effectiveText(row, "key");
  const relation = reasonTokens(row.suggestion.reasons).key;
  return relation ? `${key} ${relation}`.trim() : key;
}

/** A ✓ column: shared genre, label or artist. The sentence is its hint. */
function sharedColumn(
  id: string,
  letter: string,
  component: "genre" | "label" | "artist",
  words: string,
): TrackColumnDef<SimilarRow> {
  return {
    id,
    header: letter,
    hint: `${words}: a ✓ when it matches the track you are comparing with`,
    minWidthPx: 32,
    defaultWidthPx: 38,
    render: (row) => {
      if (!reasonTokens(row.suggestion.reasons)[component]) return "";
      return (
        <Hint text={sentenceFor(row, component) || undefined} portal>
          <span>
            <span aria-hidden="true">✓</span>
            <span className="track-table__sr-only">{words}</span>
          </span>
        </Hint>
      );
    },
    text: (row) => (reasonTokens(row.suggestion.reasons)[component] ? words : ""),
  };
}

/**
 * The title, then why each suggestion is here in a few characters, and the
 * fit after them, where a narrow pane — the sidebar and the Inspector open —
 * still shows them without scrolling. The Library's own key column is
 * replaced by the Key column here, which says the same and the relation.
 */
export const SIMILAR_COLUMNS: readonly TrackColumnDef<SimilarRow>[] = [
  { ...unsorted(TITLE), defaultWidthPx: 180 },
  {
    id: "key",
    header: "Key",
    // An empty cell is a dash; this is why (DEC-201).
    hint: "Keys come from Beatport matches. Beside the key: how it relates to the key of the track you are comparing with: same, a step either way round the wheel, relative or next",
    minWidthPx: 60,
    defaultWidthPx: 72,
    render: (row) => {
      const relation = reasonTokens(row.suggestion.reasons).key;
      return (
        <Hint text={sentenceFor(row, "key") || undefined} portal>
          <span>
            <OverriddenValue row={row} field="key" />
            {relation ? (
              <>
                {" "}
                <span>{relation}</span>
              </>
            ) : null}
          </span>
        </Hint>
      );
    },
    text: keyText,
  },
  {
    id: "bpm_delta",
    header: "BPM Δ",
    hint: "How far the BPM is from that of the track you are comparing with: −2, +3 or ±0, and a mark for half or double the tempo",
    minWidthPx: 52,
    defaultWidthPx: 56,
    align: "right",
    render: (row) => {
      const text = tempoDeltaText(reasonTokens(row.suggestion.reasons).tempo);
      return (
        <Hint text={sentenceFor(row, "tempo") || undefined} portal>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{text}</span>
        </Hint>
      );
    },
    text: (row) => tempoDeltaText(reasonTokens(row.suggestion.reasons).tempo),
  },
  sharedColumn("genre_shared", "G", "genre", "Same genre"),
  sharedColumn("label_shared", "L", "label", "Same label"),
  sharedColumn("artist_shared", "A", "artist", "Shared artist"),
  {
    // The id stays `score`, which a saved column layout keeps.
    id: "score",
    header: "Fit",
    hint: "How well this track fits, out of 100: the more blocks, the closer",
    minWidthPx: 56,
    defaultWidthPx: 64,
    render: (row) => {
      const { band, detail } = matchWords(row.suggestion.score);
      return <FitBar score={row.suggestion.score} title={`${band}: ${detail}`} />;
    },
    text: (row) => `${matchWords(row.suggestion.score).band} (${formatMatchScore(row.suggestion.score)})`,
  },
  ...REST.filter((column) => column.id !== "key").map(unsorted),
];

/**
 * The order these columns had before the Library's reorder (DEC-NEW-K1): the
 * Library's own columns follow the Fit column, so they moved with it. Layouts
 * saved in it are moved once, as the Library's are.
 */
export const SIMILAR_PREVIOUS_DEFAULT_ORDER: readonly string[] = [
  "title",
  "key",
  "bpm_delta",
  "genre_shared",
  "label_shared",
  "artist_shared",
  "score",
  ...LIBRARY_PREVIOUS_DEFAULT_ORDER.filter((id) => id !== "title" && id !== "key"),
];
