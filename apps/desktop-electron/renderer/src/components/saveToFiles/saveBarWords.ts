/**
 * What the save bar says (G4 step 4). "Save to files" is the glossary's word for
 * putting values into the audio files; "Write" is not used.
 */
import { trackWords } from "./saveChoices";

/** The sentence, without its tick: the bar draws the tick apart so a reader skips it. */
export function barSentence(tracks: number): string {
  const many = trackWords(tracks);
  return `${many} ${tracks === 1 ? "has a new value that isn't" : "have new values that aren't"} in your files yet.`;
}

export const SEE_CHANGES = "See changes";
export const SAVE_TO_FILES = "Save to files…";
