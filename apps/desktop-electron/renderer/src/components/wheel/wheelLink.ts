/**
 * Where the Camelot wheel sends the user (PAGES-10).
 *
 * A key opens the whole Library on that key (DEC-160): one rule, "Key is 9A",
 * replacing the search, the rules, the quick-filter chips and the open playlist.
 * The Library's Key field finds the key in any notation (PAGES-05), so no list of
 * spellings travels with it.
 */
import { cleanMatchState } from "../../screens/clean/cleanLink";
import { libraryRulesState } from "../../screens/library/libraryLink";

/** The location state that opens the Library on every track in this key. */
export function keyRulesState(code: string): Record<string, unknown> {
  return libraryRulesState({ match: "all", rules: [{ field: "key", operator: "is", value: code }] });
}

/** What a key's segment says a click does, in its hint. */
export function keyHint(code: string): string {
  return `${code}: show every ${code} track in the Library`;
}

type Navigate = (to: string, options?: { state?: unknown }) => void;

/**
 * Open Clean's match window: on this track when it is a library track, else on
 * the tracks not looked up yet (PAGES-07B).
 */
export function openMatching(navigate: Navigate, trackId?: number | string | null): void {
  const state = typeof trackId === "number" ? cleanMatchState([trackId]) : cleanMatchState();
  navigate("/clean", { state });
}
