/**
 * Similar tracks' columns (DISCOVER-11, DEC-096; R4-8, DEC-261).
 *
 * A suggestion is a library row, so it has the Library's columns, and some of
 * its own after the title, each a few characters wide and built from the
 * engine's structured reasons (`reasonTokens`): **Key** (the track's key and
 * how it relates to the seed's: "9A +1", "8A same"), **BPM Δ** ("−2", "+3",
 * "±0", "0.5×"), a check mark each under **Same genre**, **Same label** and **Same artist** for
 * what it shares with the seed, and the **Fit** as a five-step bar with the band word and
 * number in its title. A sentence ("Mixes well (next key): 8A → 9A", from
 * `describeSimilarReason`) is the hint on each reason cell, so a token is never
 * the only account of why a track is here. The copy takes each column's own
 * `text`; `reasonsText` joins the sentences for Prepare's Suggestions.
 *
 * The list is in the engine's order, best first then by id, until a heading sorts it in the
 * table over the suggestions it holds (C193); the last such sort is remembered with the layout.
 * Title and Artist come first, then Key, BPM and Genre (C70). The old `reasons` column id is
 * gone; a saved layout that names it is dropped by `reconcileLayout`, which ignores ids the
 * registry does not have.
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
import { PixelIcon } from "../../components/PixelIcon";
import type { SortValue } from "./clientSort";
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

/**
 * What each Library column sorts by, over the rows a page holds. The Library's own columns sort on
 * the engine, which a suggestion list is not read through, so here they sort in the table (C193).
 */
const LIBRARY_ORDER: Readonly<Partial<Record<string, (row: LibraryTrackRow) => SortValue>>> = {
  title: (row) => row.title,
  artist: (row) => row.artist,
  remixer: (row) => row.remixer,
  bpm: (row) => row.effective_bpm ?? row.bpm,
  duration_seconds: (row) => row.duration_seconds,
  genre: (row) => effectiveText(row, "genre"),
  label: (row) => effectiveText(row, "label"),
  rating: (row) => row.effective_rating,
  album: (row) => row.album,
  year: (row) => row.effective_year ?? row.year,
  play_count: (row) => row.play_count,
  date_added: (row) => row.date_added,
  bitrate: (row) => row.bitrate,
};

function sortsHere(column: TrackColumnDef<LibraryTrackRow>): TrackColumnDef<SimilarRow> {
  const { sortKey: _engineOrder, ...rest } = column;
  const accessor = LIBRARY_ORDER[column.id];
  return accessor ? { ...rest, accessor } : rest;
}

const libraryColumn = (id: string) => {
  const column = LIBRARY_COLUMNS.find((entry) => entry.id === id);
  if (!column) throw new Error(`The Library has no ${id} column`);
  return sortsHere(column);
};

/** Title, Artist, Key, BPM and Genre lead (C70); the rest follow the reasons, as the Library lists them. */
const LEAD = ["title", "artist", "key", "bpm", "genre"];

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

/** A check-mark column: shared genre, label or artist. The sentence is its hint. */
function sharedColumn(
  id: string,
  header: string,
  component: "genre" | "label" | "artist",
  words: string,
): TrackColumnDef<SimilarRow> {
  const shares = (row: SimilarRow) => Boolean(reasonTokens(row.suggestion.reasons)[component]);
  return {
    id,
    header,
    hint: `${header}: a check mark when it matches the track you are comparing with`,
    accessor: (row) => (shares(row) ? 1 : 0),
    minWidthPx: 64,
    defaultWidthPx: 84,
    render: (row) => {
      if (!shares(row)) return null;
      return (
        <Hint text={sentenceFor(row, component) || undefined} portal>
          <span>
            <PixelIcon name="check" size="sm" />
            <span className="track-table__sr-only">{words}</span>
          </span>
        </Hint>
      );
    },
    text: (row) => (shares(row) ? words : ""),
  };
}

/**
 * The title, then why each suggestion is here in a few characters, and the
 * fit after them, where a narrow pane — the sidebar and the Inspector open —
 * still shows them without scrolling. The Library's own key column is
 * replaced by the Key column here, which says the same and the relation.
 */
export const SIMILAR_COLUMNS: readonly TrackColumnDef<SimilarRow>[] = [
  { ...libraryColumn("title"), defaultWidthPx: 180 },
  libraryColumn("artist"),
  {
    id: "key",
    header: "Key",
    // An empty cell is a dash; this is why (DEC-201).
    hint: "Keys come from Beatport matches. Beside the key: how it relates to the key of the track you are comparing with: same, a step either way round the wheel, relative or next",
    accessor: (row) => effectiveText(row, "key"),
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
  libraryColumn("bpm"),
  libraryColumn("genre"),
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
  sharedColumn("genre_shared", "Same genre", "genre", "Same genre"),
  sharedColumn("label_shared", "Same label", "label", "Same label"),
  sharedColumn("artist_shared", "Same artist", "artist", "Same artist"),
  {
    // The id stays `score`, which a saved column layout keeps.
    id: "score",
    header: "Fit",
    hint: "How well this track fits, out of 100: the more blocks, the closer",
    accessor: (row) => row.suggestion.score,
    minWidthPx: 56,
    defaultWidthPx: 64,
    render: (row) => {
      const { band, detail } = matchWords(row.suggestion.score);
      return <FitBar score={row.suggestion.score} title={`${band}: ${detail}`} />;
    },
    text: (row) => `${matchWords(row.suggestion.score).band} (${formatMatchScore(row.suggestion.score)})`,
  },
  ...LIBRARY_COLUMNS.filter((column) => !LEAD.includes(column.id)).map(sortsHere),
];

/**
 * The order these columns had before Title and Artist moved to the front and Key, BPM and Genre
 * followed them (C70): the reasons came right after the title, the Library's columns after the
 * Fit. A layout saved in it is moved once, as the Library's are.
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
