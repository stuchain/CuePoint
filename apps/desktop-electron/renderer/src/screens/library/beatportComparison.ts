/**
 * What the Beatport tab says about a matched track (D16): how strong the match is in words, and the
 * table of Rekordbox's values against Beatport's. The full side-by-side with every candidate is
 * Clean's job, one link away. Pure, so the rules are tested here.
 */
import type { LibraryTrackRow, MatchCandidate } from "../../api/cuepointBridge.types";
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

/**
 * How strong a match is, in words (M134, D16): the matcher's own bands, so the number needs no scale.
 * Mirrors `_confidence_label` in the engine's matcher (95 and above high, 85 and above medium).
 */
export function matchStrength(score: number | null | undefined): string {
  if (score == null) return "";
  if (score >= 95) return "Strong match";
  if (score >= 85) return "Good match";
  return "Weak match";
}

/** What the strength word means, for its hover: the score and the bands it falls in. */
export function matchStrengthTitle(score: number | null | undefined): string {
  if (score == null) return "";
  return `Match score ${Number(score.toFixed(1))}: 95 or more is a strong match, 85 or more a good one.`;
}

/** One line of the Rekordbox-against-Beatport table. */
export interface ComparisonRow {
  id: "title" | "artist" | "key" | "bpm" | "genre" | "label" | "year";
  label: string;
  /** What Rekordbox sent. */
  rekordbox: string;
  /** What is used when that is not Rekordbox's (an edit, or a Beatport value applied); else null. */
  using: string | null;
  /** What Beatport has; empty when it has nothing. */
  beatport: string;
  /** Beatport has a value and what is used is not it (a listed genre counts as it). */
  differs: boolean;
}

/**
 * The table the Beatport tab draws (M134, D16): every field either side has a value for, Rekordbox's beside
 * Beatport's. Pure, so the rows are tested here. The title and the artist are compared too, so Beatport's
 * own title is shown only where it is a different text, never as a line that repeats the header.
 */
export function comparisonRows(
  track: Pick<LibraryTrackRow, "title" | "artist" | "key" | "year"> & Partial<LibraryTrackRow>,
  candidate: Pick<MatchCandidate, "title" | "artists" | "key" | "bpm" | "genre" | "label" | "release_year"> | null,
  fieldRows: readonly BeatportFieldRow[],
): ComparisonRow[] {
  const byField = new Map(fieldRows.map((row) => [row.field, row]));
  const plain = (
    id: ComparisonRow["id"],
    label: string,
    rekordbox: string,
    using: string,
    beatport: string,
  ): ComparisonRow => ({
    id,
    label,
    rekordbox,
    using: same(using, rekordbox) || using.trim() === "" ? null : using,
    beatport,
    differs: beatport.trim() !== "" && !same(beatport, using),
  });
  const fromField = (id: "bpm" | "genre" | "label" | "year"): ComparisonRow => {
    const row = byField.get(id);
    const beatport = row?.beatport ?? "";
    let differs = beatport.trim() !== "" && !same(beatport, row?.effective ?? "");
    if (differs && id === "genre" && row) {
      differs = !beatportGenres(beatport).some((genre) => same(genre, row.effective));
    }
    return {
      id,
      label: row?.label ?? id,
      rekordbox: row?.imported ?? "",
      using: row && !same(row.effective, row.imported) && row.effective.trim() !== "" ? row.effective : null,
      beatport,
      differs,
    };
  };
  const rows: ComparisonRow[] = [
    plain("title", "Title", track.title ?? "", track.title ?? "", candidate?.title ?? ""),
    plain("artist", "Artist", track.artist ?? "", track.artist ?? "", candidate?.artists ?? ""),
    plain("key", "Key", track.key ?? "", track.effective_key ?? "", candidate?.key ?? ""),
    fromField("bpm"),
    fromField("genre"),
    fromField("label"),
    fromField("year"),
  ];
  return rows.filter((row) => row.rekordbox.trim() !== "" || row.beatport.trim() !== "");
}
