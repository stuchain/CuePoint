/**
 * The one facts line under a track's name (consistency areas 16 and 44):
 * artist · label · key · BPM · year, with a missing part skipped so a separator is
 * never stranded. Every key is shown as its Camelot code.
 */
import { formatBpm } from "../components/format/bpm";

export const FACTS_SEPARATOR = " · ";

const LETTER_PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The Camelot number of a major key by pitch class (0 = C), and of a minor key. */
const MAJOR_NUMBER = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const MINOR_NUMBER = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

/**
 * A key as its Camelot code ("8A"), or null when it is not a key. Reads Camelot codes
 * ("8A", "08a"), and musical keys: "Am", "A minor", "C", "F♯m", "Bb", "Ebm", "C major".
 */
export function toCamelot(key: string | null | undefined): string | null {
  const text = key?.trim();
  if (!text) return null;
  const camelot = /^0?(\d{1,2})\s*([ABab])$/.exec(text);
  if (camelot) {
    const number = Number(camelot[1]);
    return number >= 1 && number <= 12 ? `${number}${camelot[2]!.toUpperCase()}` : null;
  }
  const musical = /^([A-Ga-g])\s*([#♯b♭]*)\s*(minor|major|min|maj|m)?$/i.exec(
    text.replace(/\s+/g, " "),
  );
  if (!musical) return null;
  const letter = musical[1]!.toUpperCase();
  const accidental = musical[2]!;
  let pitch = LETTER_PITCH[letter]!;
  for (const mark of accidental) pitch += mark === "#" || mark === "♯" ? 1 : -1;
  pitch = ((pitch % 12) + 12) % 12;
  const quality = (musical[3] ?? "").toLowerCase();
  // "M" alone would be major in some tools; only a lowercase "m" or the words say minor.
  const minor = quality === "minor" || quality === "min" || musical[3] === "m";
  return minor ? `${MINOR_NUMBER[pitch]}A` : `${MAJOR_NUMBER[pitch]}B`;
}

/** What to show for a key: its Camelot code, the text as given when it is not a key, or "". */
export function keyDisplay(key: string | null | undefined): string {
  const text = key?.trim() ?? "";
  if (!text) return "";
  return toCamelot(text) ?? text;
}

export interface TrackFacts {
  artist?: string | null;
  label?: string | null;
  key?: string | null;
  bpm?: number | null;
  year?: number | string | null;
}

/** The parts of the facts line that exist, in order, as text. */
export function trackFactParts(facts: TrackFacts): string[] {
  const bpm = formatBpm(facts.bpm);
  const year = facts.year === null || facts.year === undefined ? "" : String(facts.year);
  return [
    facts.artist ?? "",
    facts.label ?? "",
    keyDisplay(facts.key),
    bpm ? `${bpm} BPM` : "",
    year && year !== "0" ? year : "",
  ]
    .map((part) => part.trim())
    .filter(Boolean);
}

/** "Artist · Label · 8A · 128 BPM · 2021"; whatever is missing is left out. */
export function trackFactsLine(facts: TrackFacts): string {
  return trackFactParts(facts).join(FACTS_SEPARATOR);
}

/** "Title · Artist": who a track is, where its facts are not shown (a toast, a dialog, a row's name). */
export function trackIdentity(title: string | null | undefined, artist: string | null | undefined): string {
  return [title, artist]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(FACTS_SEPARATOR);
}
