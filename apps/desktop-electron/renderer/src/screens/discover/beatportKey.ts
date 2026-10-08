/**
 * A Beatport track's key as the Camelot code the app uses (DEC-201, PAGES-08).
 *
 * The engine sends a Beatport row's key in classic notation ("Am", "F#m",
 * "Gb") because that is how it keeps the catalog. The app shows Camelot ("8A")
 * and the header's wheel lights it, so a selected result row hands the wheel
 * this reading. The reading is a copy of the engine's `parse_key`, kept small:
 * a spelling it cannot read is no key, never a guess.
 */
import type { BeatportTrackRow } from "../../api/cuepointBridge.types";

/** The semitone above C of each natural note. */
const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The Camelot number of each major key, by its tonic's semitone above C. */
const MAJOR_NUMBER = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];

const CAMELOT = /^(\d{1,2})([ab])$/i;
const NOTE = /^([A-Ga-g])\s*([#♯b♭]?)\s*([A-Za-z]*)$/;

/** The Camelot code a key's text names, or null when it is not a key. */
export function camelotOf(text: string | null | undefined): string | null {
  const trimmed = (text ?? "").trim();
  if (trimmed === "") return null;

  const camelot = CAMELOT.exec(trimmed);
  if (camelot) {
    const number = Number(camelot[1]);
    return number >= 1 && number <= 12 ? `${number}${camelot[2]!.toUpperCase()}` : null;
  }

  const note = NOTE.exec(trimmed);
  if (!note) return null;
  const [, letter, accidental, quality] = note;
  const flat = accidental === "b" || accidental === "♭";
  const sharp = accidental === "#" || accidental === "♯";
  const natural = NATURALS[letter!.toUpperCase()]!;
  const pitch = (natural + (sharp ? 1 : 0) - (flat ? 1 : 0) + 12) % 12;
  // A lone lowercase "m" is minor, a lone "M" is major, and a bare note is
  // major, as "C" and "Gb" are written.
  const word = quality!;
  const lower = word.toLowerCase();
  if (word === "M" || word === "" || lower === "maj" || lower === "major") {
    return `${MAJOR_NUMBER[pitch]}B`;
  }
  if (lower === "m" || lower === "min" || lower === "minor") {
    return `${MAJOR_NUMBER[(pitch + 3) % 12]}A`;
  }
  return null;
}

/** A Beatport row's key as Camelot, or null (Beatport's own key; never Rekordbox's). */
export function beatportRowKey(row: Pick<BeatportTrackRow, "key">): string | null {
  return camelotOf(row.key);
}
