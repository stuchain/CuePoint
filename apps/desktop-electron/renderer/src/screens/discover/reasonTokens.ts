/**
 * Similar Tracks' reasons as short tokens (R4-8, DEC-261).
 *
 * A reason in words ("Mixes well (next key): 9A → 8A") does not fit a narrow
 * cell and was cut off in Prepare's Suggestions. The engine sends each reason
 * as data, so this module reads the same data as a few characters: the key
 * step ("+1"), the tempo change ("−2") and a letter for each of genre, label
 * and artist. `similarReasons.ts` keeps the sentence, and the cell's hint
 * shows it, so nothing is lost, only moved.
 *
 * Pure: no React. `reasonTokens.test.ts` runs over every reason in
 * `similarReasons.fixture.json`, so a reason added to the engine without a
 * token fails there.
 */
import { camelotOf } from "./beatportKey";
import type { SimilarReason } from "./similarReasons";

/** The real minus sign, which lines up with "+" in the data font. */
const MINUS = "−";

export interface ReasonTokens {
  key: "same" | "+1" | "−1" | "rel." | "next" | null;
  tempo: { delta: number } | "half" | "double" | null;
  genre: boolean;
  label: boolean;
  artist: boolean;
}

/** The Camelot number of a key in either notation, or null when it is not one. */
function camelotNumber(key: string): number | null {
  const camelot = camelotOf(key);
  return camelot ? Number(camelot.slice(0, -1)) : null;
}

/** "+1" when `to` is one step clockwise of `from` on the wheel (12 wraps to 1), "−1" the other way. */
function keyStep(from: string, to: string): ReasonTokens["key"] {
  const a = camelotNumber(from);
  const b = camelotNumber(to);
  if (a === null || b === null) return "next";
  const step = (((b - a) % 12) + 12) % 12;
  if (step === 1) return "+1";
  if (step === 11) return "−1";
  // The same number in the other mode is the relative key; anything else is not a step the
  // engine calls adjacent, so the cell says only that it is a neighbour.
  return step === 0 ? "rel." : "next";
}

/** Rounds .5 away from zero, so a change of −0.5 reads "−1", not "±0". */
function roundHalfAway(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

/** What a list of reasons says, token by token. */
export function reasonTokens(reasons: readonly SimilarReason[]): ReasonTokens {
  const tokens: ReasonTokens = { key: null, tempo: null, genre: false, label: false, artist: false };
  for (const reason of reasons) {
    switch (reason.component) {
      case "key":
        tokens.key =
          reason.detail === "same" ? "same" : reason.detail === "relative" ? "rel." : keyStep(reason.from, reason.to);
        break;
      case "tempo":
        tokens.tempo =
          reason.detail === "half" || reason.detail === "double"
            ? reason.detail
            : { delta: roundHalfAway(reason.to - reason.from) };
        break;
      case "genre":
        tokens.genre = true;
        break;
      case "label":
        tokens.label = true;
        break;
      case "artist":
        tokens.artist = true;
        break;
    }
  }
  return tokens;
}

/**
 * A tempo change as a column of its own reads it, without a unit (the header
 * says BPM Δ): "−2", "+3", "±0", "0.5×" and "2×". Empty when there is none.
 */
export function tempoDeltaText(tempo: ReasonTokens["tempo"]): string {
  if (tempo === null) return "";
  if (tempo === "half") return "0.5×";
  if (tempo === "double") return "2×";
  if (tempo.delta === 0) return "±0";
  return tempo.delta > 0 ? `+${tempo.delta}` : `${MINUS}${Math.abs(tempo.delta)}`;
}

function tempoToken(tempo: NonNullable<ReasonTokens["tempo"]>): string {
  const text = tempoDeltaText(tempo);
  // The unit keeps a tempo change from reading as a key step: "+1 · +1 BPM".
  return typeof tempo === "string" ? text : `${text} BPM`;
}

/** The compact cell text: "+1 · −2 BPM · G · A". Empty when nothing is in common. */
export function tokenRun(tokens: ReasonTokens): string {
  const parts: string[] = [];
  if (tokens.key) parts.push(tokens.key);
  if (tokens.tempo) parts.push(tempoToken(tokens.tempo));
  if (tokens.genre) parts.push("G");
  if (tokens.label) parts.push("L");
  if (tokens.artist) parts.push("A");
  return parts.join(" · ");
}
