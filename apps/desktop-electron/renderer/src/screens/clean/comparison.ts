/**
 * The Match area's choices about candidates, as data (CLEAN-12, C14), and the
 * values applying a match copies, which the Library's own dialogs also read.
 *
 * One at a time draws a track beside the candidates the matcher scored. Which
 * one is chosen, which are shown, how likely one is and what the matcher's own
 * scoring rows say are decided here, so each can be tested without rendering.
 * Whether a value *differs* is not decided here at all: the engine answers it
 * (`MatchCandidate.differs`), because the same key in two notations is not a
 * difference and only the engine knows the notations.
 */
import type {
  MatchCandidate,
  OverrideField,
} from "../../api/cuepointBridge.types";
import { formatMatchScore } from "../../format/units";
import { formatBpm } from "../library/trackValues";
import { rejectReasonText } from "./cleanFormat";

/** Absent is a dash, never a zero and never blank: a blank cell reads as a bug. */
export function cellText(value: string | number | null | undefined): string {
  return value == null || value === "" ? "—" : String(value);
}

function whole(value: number | null): string {
  return cellText(value == null ? null : Math.round(value));
}

function signed(value: number | null): string {
  if (value == null) return "—";
  return value > 0 ? `+${value}` : String(value);
}

interface ScoreRow {
  id: string;
  label: string;
  candidate: (candidate: MatchCandidate) => string;
}

/** How the matcher scored each candidate: only candidates have these. */
export const SCORE_ROWS: readonly ScoreRow[] = [
  { id: "score", label: "Score", candidate: (c) => formatMatchScore(c.score) },
  { id: "base_score", label: "Before bonuses", candidate: (c) => cellText(formatMatchScore(c.base_score)) },
  { id: "title_sim", label: "Title similarity", candidate: (c) => whole(c.title_sim) },
  { id: "artist_sim", label: "Artist similarity", candidate: (c) => whole(c.artist_sim) },
  { id: "bonus_year", label: "Year bonus", candidate: (c) => signed(c.bonus_year) },
  { id: "bonus_key", label: "Key bonus", candidate: (c) => signed(c.bonus_key) },
  {
    id: "guard",
    label: "Guards",
    candidate: (c) => (c.guard_ok ? "Passed" : rejectReasonText(c.reject_reason)),
  },
  { id: "query", label: "Found by", candidate: (c) => cellText(c.query_text) },
];

/**
 * One plain line for a candidate (CLN-5): how likely it is, on a scale a
 * person can read, or why it was ruled out. The matcher's own numbers are the
 * rows folded under "Why this score?".
 */
export function scoreLine(candidate: MatchCandidate): string {
  if (!candidate.guard_ok) return rejectReasonText(candidate.reject_reason);
  return `${formatMatchScore(candidate.score)} likely`;
}

/** The words for a field Correct can name. */
export const APPLY_FIELD_LABELS: Record<OverrideField, string> = {
  key: "Key",
  bpm: "BPM",
  genre: "Genre",
  label: "Label",
  year: "Year",
};

/** A field applying can copy: every overridable one but the key, which an accepted match gives (DEC-201). */
export type ApplyField = Exclude<OverrideField, "key">;

/** The four fields applying can copy (DEC-068), in the order the Library shows them. */
export const APPLY_FIELDS: readonly ApplyField[] = ["bpm", "genre", "label", "year"];

/** What applying one field would copy from a candidate, or null when it has nothing. */
export function applyValue(field: ApplyField, candidate: MatchCandidate): string | null {
  switch (field) {
    case "bpm":
      return candidate.bpm == null ? null : formatBpm(candidate.bpm);
    case "genre":
      return candidate.genre || null;
    case "label":
      return candidate.label || null;
    case "year":
      return candidate.release_year == null ? null : String(candidate.release_year);
  }
}
