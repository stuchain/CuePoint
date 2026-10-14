/**
 * The values a Correct can also copy, and the key as Camelot (C14).
 *
 * The review panel draws a track beside the candidate it was matched with; which fields **Correct**
 * also copies is the reviewer's choice, remembered (`useMatchTicks.ts`). Whether a value *differs*
 * is the engine's answer (`ReviewTrack.differing`: the same key in two notations is not a
 * difference), so nothing here compares.
 *
 * **The key is not "applied"** (DEC-201, DEC-202): accepting a match already makes Beatport's key
 * the track's shown key, unless the track has a key of the user's own. Only then is there something
 * to tick: replacing it.
 */
import type { CorrectField } from "../../../api/cuepointBridge.types";
import { camelotOf as parseCamelot } from "../../../components/wheel/keyColour";

/** A field a tick names: the four Correct copies, and the key it may replace. */
export type CardField = CorrectField | "key";

/** The fields in the order a DJ reads them. */
export const CARD_FIELDS: readonly CardField[] = ["key", "bpm", "genre", "label", "year"];

export const CARD_FIELD_LABELS: Record<CardField, string> = {
  key: "Key",
  bpm: "BPM",
  genre: "Genre",
  label: "Label",
  year: "Year",
};

/**
 * A key as Camelot, the way the app shows keys: "A Minor" is 8A. Anything that
 * is not a key this knows is returned as it came, so a value is never hidden
 * because its notation is unfamiliar.
 */
export function camelotOf(key: string | null | undefined): string | null {
  const text = (key ?? "").trim();
  if (text === "") return null;
  return parseCamelot(text) ?? text;
}
