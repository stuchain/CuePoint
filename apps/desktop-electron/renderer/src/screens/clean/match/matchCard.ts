/**
 * A key as Camelot, the way the app shows keys (C14).
 *
 * The review's panel draws your file's key beside the candidates'. Whether a value *differs* is the
 * engine's answer (`ReviewTrack.differing`: the same key in two notations is not a difference), so
 * nothing here compares.
 */
import { camelotOf as parseCamelot } from "../../../components/wheel/keyColour";

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
