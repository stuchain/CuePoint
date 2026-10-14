/**
 * What the Beatport tab says about a matched track: the fields Beatport agrees
 * on in one line, and only the fields that differ in full.
 *
 * The side-by-side of every field is Clean's job; here an equal value is said
 * once, so the tab stays a few lines long. Pure, so the rule is tested here.
 */
import type { MatchCandidate } from "../../api/cuepointBridge.types";
import type { BeatportFieldRow } from "./libraryClean";

/** Whether two values read the same: case and surrounding space do not count. */
function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Beatport's genre list: split on "," and "|", trimmed, each once (case does not count). */
export function beatportGenres(value: string): string[] {
  const seen = new Set<string>();
  const genres: string[] = [];
  for (const part of value.split(/[,|]/)) {
    const genre = part.trim();
    if (genre === "" || seen.has(genre.toLowerCase())) continue;
    seen.add(genre.toLowerCase());
    genres.push(genre);
  }
  return genres;
}

export interface BeatportComparison {
  /** The labels of the fields where what is used is what Beatport has. */
  agree: string[];
  /** Of those, the ones that are not Rekordbox's value: applied from Beatport, or typed to match it. */
  applied: string[];
  /** The other genres Beatport lists when the one used is among them, for "Beatport also lists …". */
  alsoGenres: string[];
  /** The fields where what is used is not what Beatport has. */
  differ: BeatportFieldRow[];
}

/**
 * Splits the field rows. A field agrees when what is used is what Beatport has (a genre
 * agrees when it is one of Beatport's listed genres). A field Beatport has no value for is
 * neither: there is nothing to compare, and saying "differs" about a blank would be noise.
 */
export function compareBeatportRows(rows: readonly BeatportFieldRow[]): BeatportComparison {
  const agree: string[] = [];
  const applied: string[] = [];
  const differ: BeatportFieldRow[] = [];
  let alsoGenres: string[] = [];
  for (const row of rows) {
    if (row.beatport.trim() === "") continue;
    let matches = same(row.beatport, row.effective);
    if (!matches && row.field === "genre") {
      const genres = beatportGenres(row.beatport);
      const used = genres.findIndex((genre) => same(genre, row.effective));
      if (used >= 0) {
        matches = true;
        alsoGenres = genres.filter((_, index) => index !== used);
      }
    }
    if (!matches) {
      differ.push(row);
      continue;
    }
    agree.push(row.label);
    if (!same(row.imported, row.effective)) applied.push(row.label);
  }
  return { agree, applied, alsoGenres, differ };
}

/** "BPM, label and year", "BPM", "BPM and label": a list in words. */
export function joinLabels(labels: readonly string[]): string {
  const words = labels.map((label) => (label === "BPM" || label === "Key" ? label : label.toLowerCase()));
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The one line for the agreeing fields: "BPM, label and year match", "Label matches", or "" when none do. */
export function agreeLine(agree: readonly string[]): string {
  if (agree.length === 0) return "";
  const words = joinLabels(agree);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${agree.length === 1 ? "matches" : "match"}`;
}

/** The release line: "deadmau5 – Strobe (Original Mix) · mau5trap". */
export function releaseLine(
  candidate: Pick<MatchCandidate, "title" | "mix" | "artists" | "label" | "release_name">,
): string {
  const title = candidate.title ? `${candidate.title}${candidate.mix ? ` (${candidate.mix})` : ""}` : "";
  const named = [candidate.artists, title].filter(Boolean).join(" – ");
  return [named, candidate.label || candidate.release_name].filter(Boolean).join(" · ");
}

/** The score, small: "score 141", "score 96.5". */
export function scoreWords(score: number | null | undefined): string {
  return score == null ? "" : `score ${Number(score.toFixed(1))}`;
}
