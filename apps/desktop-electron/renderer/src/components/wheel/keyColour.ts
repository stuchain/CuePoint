/**
 * A key's text as the Camelot code the app draws (DEC-201, PAGES-08), and the code's hue and ring.
 *
 * The engine sends a Beatport row's key in classic notation ("Am", "F#m",
 * "Gb"); Rekordbox and the tags may spell it out or already give a code. The
 * app shows Camelot ("8A"), so every screen reads a key through this one
 * parser. It is a copy of the engine's `parse_key`, kept small: a spelling it
 * cannot read is no key, never a guess.
 */
import { parseCode, type Ring } from "./camelot";

/** The semitone above C of each natural note. */
const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The Camelot number of each major key, by its tonic's semitone above C. */
const MAJOR_NUMBER = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];

const CAMELOT = /^(\d{1,2})([ab])$/i;
const NOTE = /^([A-Ga-g])\s*([#♯bB♭]?)\s*([A-Za-z]*)$/;

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
  const flat = accidental === "b" || accidental === "B" || accidental === "♭";
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

/** A code's Camelot number, 1 to 12: its place round the wheel, and so its hue. */
export function keyHue(code: string): number | null {
  return parseCode(code)?.number ?? null;
}

/** A code's ring: A (minor, deeper) or B (major, lighter). */
export function keyRing(code: string): Ring | null {
  return parseCode(code)?.letter ?? null;
}
