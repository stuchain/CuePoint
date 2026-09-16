/**
 * The comparison panel's rows and choices, as data (CLEAN-12).
 *
 * The panel draws a track's imported values beside every candidate the matcher
 * scored. Which rows exist, what a cell says, which candidate is chosen and
 * what applying would copy are decided here, so each can be tested without
 * rendering. Whether a value *differs* is not decided here at all: the engine
 * answers it (`MatchCandidate.differs`), because the same key in two notations
 * is not a difference and only the engine knows the notations.
 */
import type {
  CandidateDifferences,
  ComparedTrack,
  MatchCandidate,
  OverrideField,
  TrackMatchState,
} from "../../api/cuepointBridge.types";
import { formatBpm } from "../library/libraryColumns";
import { rejectReasonText } from "./cleanFormat";

/** Absent is a dash, never a zero and never blank: a blank cell reads as a bug. */
export function cellText(value: string | number | null | undefined): string {
  return value == null || value === "" ? "—" : String(value);
}

export interface ValueRow {
  id: string;
  label: string;
  track: (track: ComparedTrack) => string;
  candidate: (candidate: MatchCandidate) => string;
  /** The engine's answer for this row, when the row is one it compares. */
  differs?: keyof CandidateDifferences;
}

/** The values a track and a candidate both have, in the order a DJ reads them. */
export const VALUE_ROWS: readonly ValueRow[] = [
  {
    id: "title",
    label: "Title",
    track: (t) => cellText(t.title),
    candidate: (c) => cellText(c.title),
    differs: "title",
  },
  {
    id: "artists",
    label: "Artists",
    track: (t) => cellText(t.artist),
    candidate: (c) => cellText(c.artists),
    differs: "artists",
  },
  {
    id: "mix",
    label: "Mix",
    track: (t) => cellText(t.mix),
    candidate: (c) => cellText(c.mix),
    differs: "mix",
  },
  {
    id: "remixers",
    label: "Remixers",
    track: (t) => cellText(t.remixer),
    candidate: (c) => cellText(c.remixers),
    differs: "remixers",
  },
  {
    id: "label",
    label: "Label",
    track: (t) => cellText(t.label),
    candidate: (c) => cellText(c.label),
    differs: "label",
  },
  {
    id: "genre",
    label: "Genre",
    track: (t) => cellText(t.genre),
    candidate: (c) =>
      cellText(c.subgenre && c.genre ? `${c.genre} (${c.subgenre})` : c.genre),
    differs: "genre",
  },
  {
    id: "key",
    label: "Key",
    track: (t) => cellText(t.key),
    candidate: (c) => cellText(c.key),
    differs: "key",
  },
  {
    id: "bpm",
    label: "BPM",
    track: (t) => cellText(t.bpm == null ? null : formatBpm(t.bpm)),
    candidate: (c) => cellText(c.bpm == null ? null : formatBpm(c.bpm)),
    differs: "bpm",
  },
  {
    id: "year",
    label: "Year",
    track: (t) => cellText(t.year),
    candidate: (c) => cellText(c.release_year),
    differs: "year",
  },
  {
    id: "release",
    label: "Release",
    track: (t) => cellText(t.album),
    candidate: (c) => cellText(c.release_name),
  },
];

function whole(value: number | null): string {
  return cellText(value == null ? null : Math.round(value));
}

function signed(value: number | null): string {
  if (value == null) return "—";
  return value > 0 ? `+${value}` : String(value);
}

export interface ScoreRow {
  id: string;
  label: string;
  candidate: (candidate: MatchCandidate) => string;
}

/** How the matcher scored each candidate: only candidates have these. */
export const SCORE_ROWS: readonly ScoreRow[] = [
  { id: "score", label: "Score", candidate: (c) => c.score.toFixed(1) },
  { id: "base_score", label: "Before bonuses", candidate: (c) => cellText(c.base_score?.toFixed(1)) },
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

/** Candidates shown before "show all": enough to compare, few enough to read at 1×. */
export const CANDIDATE_LIMIT = 5;

/**
 * The candidate a reviewer starts on: the one the state points at — accepted,
 * rejected or proposed — else the matcher's winner, else the first scored.
 */
export function defaultChoice(
  state: TrackMatchState | null,
  candidates: readonly MatchCandidate[],
): number | null {
  if (candidates.length === 0) return null;
  const pointed = candidates.find((candidate) => candidate.id === state?.candidate_id);
  if (pointed) return pointed.id;
  return (candidates.find((candidate) => candidate.is_winner) ?? candidates[0]!).id;
}

/** The candidates drawn: the first few by rank, and the chosen one wherever it ranks. */
export function visibleCandidates(
  candidates: readonly MatchCandidate[],
  showAll: boolean,
  chosen: number | null,
  limit: number = CANDIDATE_LIMIT,
): MatchCandidate[] {
  const ranked = [...candidates].sort((a, b) => a.rank - b.rank);
  if (showAll || ranked.length <= limit) return ranked;
  const shown = ranked.slice(0, limit);
  const picked = ranked.find((candidate) => candidate.id === chosen);
  if (picked && !shown.includes(picked)) shown.push(picked);
  return shown;
}

/** The chosen candidate moved one step left or right, stopping at the ends. */
export function stepChoice(
  shown: readonly MatchCandidate[],
  chosen: number | null,
  step: -1 | 1,
): number | null {
  if (shown.length === 0) return null;
  const at = shown.findIndex((candidate) => candidate.id === chosen);
  if (at === -1) return shown[0]!.id;
  const next = Math.max(0, Math.min(shown.length - 1, at + step));
  return shown[next]!.id;
}

/** What a candidate is, beyond its values: short words beside its rank. */
export function candidateBadges(
  candidate: MatchCandidate,
  state: TrackMatchState | null,
): string[] {
  const badges: string[] = [];
  if (state?.candidate_id === candidate.id) {
    if (state.state === "accepted") badges.push("Accepted");
    else if (state.state === "rejected") badges.push("Rejected");
    else if (candidate.is_winner) badges.push("Proposed");
  } else if (candidate.is_winner) {
    badges.push("Matcher's pick");
  }
  if (!candidate.guard_ok) badges.push("Refused");
  return badges;
}

/** The five fields applying can copy (DEC-068), in the order the Library shows them. */
export const APPLY_FIELDS: readonly OverrideField[] = ["key", "bpm", "genre", "label", "year"];

export const APPLY_FIELD_LABELS: Record<OverrideField, string> = {
  key: "Key",
  bpm: "BPM",
  genre: "Genre",
  label: "Label",
  year: "Year",
};

/** What applying one field would copy from a candidate, or null when it has nothing. */
export function applyValue(field: OverrideField, candidate: MatchCandidate): string | null {
  switch (field) {
    case "key":
      return candidate.key || null;
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
