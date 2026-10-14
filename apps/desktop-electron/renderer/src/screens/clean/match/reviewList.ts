/**
 * The words and the order of the review list (the Review tab), as pure functions.
 *
 * The engine says where each track stands (`ReviewTrack.status`), what differs from the match it
 * found, and how many hold each status; this only chooses the words, the order (decided rows move
 * to the bottom) and what the chips and the bar draw. No rule about a match lives here.
 */
import type {
  MatchCandidate,
  MatchReviewFilter,
  ReviewCandidate,
  ReviewStatus,
  ReviewTrack,
} from "../../../api/cuepointBridge.types";
import { CARD_FIELD_LABELS, CARD_FIELDS, type CardField } from "./matchCard";

export type ReviewCounts = Record<ReviewStatus, number>;
export type ReviewFilter = MatchReviewFilter;

const LABELS: Record<ReviewStatus, string> = {
  to_check: "To check",
  not_found: "Not found",
  search_failed: "Search failed",
  matched: "Matched",
  done: "Done",
};

/** The word on a status chip. */
export function statusLabel(status: ReviewStatus): string {
  return LABELS[status];
}

export interface ReviewChip {
  id: ReviewFilter;
  label: string;
  count: number;
}

/**
 * All, To check, Not found and Matched; Search failed, Done, Rejected and Changed since you
 * decided only while there are some.
 */
export function chipsOf(
  counts: ReviewCounts,
  total: number,
  extra: { rejected?: number; disputed?: number } = {},
): ReviewChip[] {
  const chip = (id: ReviewStatus): ReviewChip => ({ id, label: LABELS[id], count: counts[id] });
  const chips: ReviewChip[] = [{ id: "all", label: "All", count: total }];
  chips.push(chip("to_check"), chip("not_found"));
  if (counts.search_failed > 0) chips.push(chip("search_failed"));
  chips.push(chip("matched"));
  if (counts.done > 0) chips.push(chip("done"));
  if ((extra.rejected ?? 0) > 0) chips.push({ id: "rejected", label: "Rejected", count: extra.rejected! });
  if ((extra.disputed ?? 0) > 0) {
    chips.push({ id: "disputed", label: "Changed since you decided", count: extra.disputed! });
  }
  return chips;
}

/** Decided rows go to the bottom; each part keeps the engine's order. */
export function orderRows(rows: readonly ReviewTrack[]): ReviewTrack[] {
  return [...rows.filter((row) => row.status !== "done"), ...rows.filter((row) => row.status === "done")];
}

export function filterRows(rows: readonly ReviewTrack[], filter: ReviewFilter): ReviewTrack[] {
  switch (filter) {
    case "all":
      return [...rows];
    case "rejected":
      return rows.filter((row) => row.decision === "rejected");
    case "disputed":
      return rows.filter((row) => row.disputed);
    default:
      return rows.filter((row) => row.status === filter);
  }
}

const DIFFERS_WORDS: Record<string, string> = {
  title: "title",
  artist: "artist",
  remix: "remix",
  remixer: "remixer",
  key: "key",
  bpm: "BPM",
  genre: "genre",
  label: "label",
  year: "year",
};

/** What the Differs column says: the fields that differ, a tick when none does, or nothing. */
export function differsText(row: ReviewTrack): { text: string; tone: "differs" | "same" | "none" } {
  if (row.differing.length > 0) {
    return { text: row.differing.map((name) => DIFFERS_WORDS[name] ?? name).join(", "), tone: "differs" };
  }
  return row.candidate ? { text: "✓", tone: "same" } : { text: "", tone: "none" };
}

/** "Physical (Extended Mix) · Armada": the title with its version, then who made it. */
export function candidateLine(candidate: ReviewCandidate | null): string {
  if (!candidate) return "—";
  const title = candidate.title ?? "";
  const named = candidate.mix && !title.includes(candidate.mix) ? `${title} (${candidate.mix})`.trim() : title;
  const text = [named, candidate.artists]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" · ");
  return text || "—";
}

export interface BandSegment {
  status: ReviewStatus;
  count: number;
  percent: number;
}

const BAND_ORDER: readonly ReviewStatus[] = ["to_check", "not_found", "search_failed", "matched", "done"];

/** The coloured bar: each status's share of the tracks, leaving out those that hold none. */
export function bandSegments(counts: ReviewCounts, total: number): BandSegment[] {
  if (total <= 0) return [];
  return BAND_ORDER.filter((status) => counts[status] > 0).map((status) => ({
    status,
    count: counts[status],
    percent: (counts[status] / total) * 100,
  }));
}

/** "Confirm all 13 matched", or null when none is. */
export function acceptAllLabel(matched: number): string | null {
  return matched > 0 ? `Confirm all ${matched.toLocaleString()} matched` : null;
}

/** Every track decided: nothing is left to look at. */
export function isReviewed(counts: ReviewCounts, total: number): boolean {
  return total > 0 && counts.done === total;
}

/** "hJ is reviewed" and what was decided. */
export function reviewedWords(
  name: string,
  rows: readonly ReviewTrack[],
): { headline: string; detail: string } {
  const confirmed = rows.filter((row) => row.decision === "accepted").length;
  const left = rows.filter((row) => row.decision === "rejected").length;
  const parts = [`${confirmed.toLocaleString()} confirmed`];
  if (left > 0) parts.push(`${left.toLocaleString()} left unmatched`);
  return { headline: `${name} is reviewed`, detail: parts.join(" · ") };
}

/** The next undecided track after this one in the list as shown, wrapping; null when none is left. */
export function nextUndecided(shown: readonly ReviewTrack[], fromTrackId: number): number | null {
  const at = shown.findIndex((row) => row.track_id === fromTrackId);
  const after = [...shown.slice(at + 1), ...shown.slice(0, Math.max(0, at))];
  return after.find((row) => row.status !== "done")?.track_id ?? null;
}

/**
 * What Confirm all, or Correct on a selection, asks before it goes: how many, and which values it
 * will copy ("Confirm 13 and update BPM, Genre, Label, Year?"). The ticks are the person's own.
 */
export function acceptQuestion(count: number, ticks: ReadonlySet<CardField>, verb = "Confirm"): string {
  const fields = CARD_FIELDS.filter((field) => ticks.has(field)).map((field) =>
    field === "key" ? "Key (replaces yours)" : CARD_FIELD_LABELS[field],
  );
  const many = count.toLocaleString();
  return fields.length > 0
    ? `${verb} ${many} and update ${fields.join(", ")}?`
    : `${verb} ${many} without copying any values?`;
}

/** What a decision says in the live region beside the list. */
export function decisionLine(kind: "correct" | "not-this" | "leave" | "undo", title: string): string {
  switch (kind) {
    case "correct":
      return `Corrected “${title}”.`;
    case "not-this":
      return `Marked “${title}” as not this track.`;
    case "leave":
      return `Left “${title}” unmatched.`;
    case "undo":
      return `Undid the decision on “${title}”.`;
  }
}

/** A candidate a search returned, as the review list draws one. */
export function reviewCandidateOf(candidate: MatchCandidate): ReviewCandidate {
  return {
    id: candidate.id,
    title: candidate.title,
    artists: candidate.artists,
    mix: candidate.mix ?? null,
    key: candidate.key,
    bpm: candidate.bpm,
    label: candidate.label,
    genre: candidate.genre,
    release_year: candidate.release_year,
    score: candidate.score,
    guard_ok: candidate.guard_ok,
  };
}
