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
import { formatBpm } from "../library/trackValues";
import { rejectReasonText } from "./cleanFormat";

/** Absent is a dash, never a zero and never blank: a blank cell reads as a bug. */
export function cellText(value: string | number | null | undefined): string {
  return value == null || value === "" ? "—" : String(value);
}

interface ValueRow {
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
    // Rekordbox's key is not the track's key (DEC-201); Beatport's is. It is
    // shown against Beatport's so a reviewer can see they disagree, and said so.
    track: (t) => (t.key ? `${t.key} (from Rekordbox, not used)` : cellText(t.key)),
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

interface ScoreRow {
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

/**
 * One plain line for a candidate (CLN-5): how likely it is, on a scale a
 * person can read, or why it was ruled out. The matcher's own numbers are the
 * rows folded under "Why this score?".
 */
export function scoreLine(candidate: MatchCandidate): string {
  if (!candidate.guard_ok) return rejectReasonText(candidate.reject_reason);
  const score = Math.round(candidate.score);
  const word = score >= 85 ? "Very likely" : score >= 60 ? "Possible" : "Unlikely";
  return `${word} (${score}/100)`;
}

/** Whether "Why this score?" is open, remembered in one key (CLN-5). */
export const SCORE_OPEN_STORAGE_KEY = "cuepoint-clean-score-open";

export function loadScoreOpen(): boolean {
  try {
    return localStorage.getItem(SCORE_OPEN_STORAGE_KEY) === "open";
  } catch {
    return false;
  }
}

export function saveScoreOpen(open: boolean): void {
  try {
    localStorage.setItem(SCORE_OPEN_STORAGE_KEY, open ? "open" : "closed");
  } catch {
    // Remembering is a convenience; the panel works without it.
  }
}

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
    else if (candidate.is_winner) badges.push("Suggested");
  } else if (candidate.is_winner) {
    badges.push("Best score");
  }
  if (!candidate.guard_ok) badges.push("Ruled out");
  return badges;
}

/** A field applying can copy: every overridable one but the key, which an accepted match gives (DEC-201). */
export type ApplyField = Exclude<OverrideField, "key">;

/** The four fields applying can copy (DEC-068), in the order the Library shows them. */
export const APPLY_FIELDS: readonly ApplyField[] = ["bpm", "genre", "label", "year"];

export const APPLY_FIELD_LABELS: Record<OverrideField, string> = {
  key: "Key",
  bpm: "BPM",
  genre: "Genre",
  label: "Label",
  year: "Year",
};

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
