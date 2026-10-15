/**
 * The words and the parts of the review table (the Review tab), as pure functions.
 *
 * The engine says where each track stands (`ReviewTrack.status`), whether it is ticked, what
 * differs from the match it found, and how many hold each status; this only chooses the words and
 * cuts the match into the parts the table draws. No rule about a match lives here.
 */
import type { MatchCandidate, ReviewCandidate, ReviewStatus } from "../../../api/cuepointBridge.types";

export type ReviewCounts = Record<ReviewStatus, number>;

const LABELS: Record<ReviewStatus, string> = {
  matched: "Matched",
  to_check: "Check",
  not_found: "Not found",
  search_failed: "Search failed",
};

/** The word on a status chip. */
export function statusLabel(status: ReviewStatus): string {
  return LABELS[status];
}

/** One part of the Beatport match as drawn, and whether it is the part that differs from your track. */
export interface MatchPart {
  text: string;
  differs: boolean;
}

/**
 * The Beatport match as parts: "Glue (Original Mix)" is the title and the version in brackets, then
 * the artists. The engine names which fields differ (`differing`); the part of the line each one is
 * is drawn in the warning colour, so a "(Intro)" where yours has none is seen at once.
 * Nothing at all comes back as an empty list: the table draws a dash.
 */
export function matchParts(candidate: ReviewCandidate | null, differing: readonly string[]): MatchPart[] {
  if (!candidate) return [];
  const title = candidate.title ?? "";
  const mix = candidate.mix;
  const titleDiffers = differing.includes("title");
  const mixDiffers = differing.includes("remix");
  const parts: MatchPart[] = [];
  const at = mix ? title.lastIndexOf(mix) : -1;
  if (mix && at >= 0) {
    // The version is in the title, usually in brackets: cut the brackets and the version out as one part.
    const start = at > 0 && (title[at - 1] === "(" || title[at - 1] === "[") ? at - 1 : at;
    const close = title[at + mix.length];
    const end = close === ")" || close === "]" ? at + mix.length + 1 : at + mix.length;
    const before = title.slice(0, start).trimEnd();
    const after = title.slice(end).trim();
    if (before) parts.push({ text: before, differs: titleDiffers });
    parts.push({ text: title.slice(start, end), differs: mixDiffers });
    if (after) parts.push({ text: after, differs: titleDiffers });
  } else {
    if (title) parts.push({ text: title, differs: titleDiffers });
    if (mix) parts.push({ text: `(${mix})`, differs: mixDiffers });
  }
  if (candidate.artists && candidate.artists.trim()) {
    parts.push({ text: `· ${candidate.artists}`, differs: differing.includes("artist") });
  }
  return parts;
}

/** The same line as plain text, for a label that names the match. */
export function matchText(candidate: ReviewCandidate | null): string {
  return matchParts(candidate, []).map((part) => part.text).join(" ") || "—";
}

/** "24 tracks · 22 ticked to sync", then what was not found. */
export function summaryWords(total: number, ticked: number): string {
  const tracks = `${total.toLocaleString()} ${total === 1 ? "track" : "tracks"}`;
  return `${tracks} · ${ticked.toLocaleString()} ticked to sync`;
}

/** "2 not found", or "2 not found · 1 search failed": what has no match to tick. */
export function leftOutWords(counts: ReviewCounts): string {
  const parts: string[] = [];
  if (counts.not_found > 0) parts.push(`${counts.not_found.toLocaleString()} not found`);
  if (counts.search_failed > 0) parts.push(`${counts.search_failed.toLocaleString()} search failed`);
  return parts.join(" · ");
}

/** The Sync button's words: "Sync hJ to files…". */
export function syncLabel(name: string): string {
  return `Sync ${name} to files…`;
}

/** What a tick or an untick says in the live region beside the table. */
export function tickedLine(ticked: boolean, title: string): string {
  return ticked ? `Ticked “${title}”: it will be synced.` : `Unticked “${title}”: it will be left out.`;
}

/** What the header tick says in the live region: how many tracks it ticked or unticked. */
export function allTickedLine(ticked: boolean, changed: number): string {
  if (changed === 0) return "No track changed.";
  const many = `${changed.toLocaleString()} ${changed === 1 ? "track" : "tracks"}`;
  return ticked ? `Ticked ${many}: they will be synced.` : `Unticked ${many}: they will be left out.`;
}

/** A candidate a search returned, as the table draws one. */
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
