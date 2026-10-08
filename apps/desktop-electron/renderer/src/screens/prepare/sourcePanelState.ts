/**
 * What the Prepare page remembers about its source panel, lanes and strip
 * (PREP-11, WAVE-07).
 *
 * The tab open, the pool chosen, and whether the lanes and the transition
 * strip are showing, each kept
 * in this window's storage as the source panel's width is (PREP-10). A value
 * that cannot be read is the default: remembering is a convenience, and a
 * page that will not open because of it would be a poor trade.
 */
import { WHOLE_LIBRARY_POOL, type PoolValue } from "./prepareSource";

export type SourceTab = "suggestions" | "library";

export const SOURCE_TAB_STORAGE_KEY = "cuepoint-prepare-source-tab";
export const SOURCE_POOL_STORAGE_KEY = "cuepoint-prepare-source-pool";
export const LANES_STORAGE_KEY = "cuepoint-prepare-lanes";

export const DEFAULT_SOURCE_TAB: SourceTab = "suggestions";

/**
 * The lanes start hidden. DEC-112 holds the Set's whole rows at the default
 * window and scale, and the lanes take two of them there; a person who opens
 * them keeps them open, and the choice is remembered.
 */
export const DEFAULT_LANES_OPEN = false;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A choice not remembered is not worth breaking the page over.
  }
}

export function loadSourceTab(): SourceTab {
  const value = read(SOURCE_TAB_STORAGE_KEY);
  return value === "library" || value === "suggestions" ? value : DEFAULT_SOURCE_TAB;
}

export function saveSourceTab(tab: SourceTab): void {
  write(SOURCE_TAB_STORAGE_KEY, tab);
}

/** The pool last chosen; whether it still exists is the picker's to say. */
export function loadSourcePool(): PoolValue {
  const value = read(SOURCE_POOL_STORAGE_KEY);
  return value && /^(library|playlist:\d+|collection:\d+|smart:\d+)$/.test(value)
    ? value
    : WHOLE_LIBRARY_POOL;
}

export function saveSourcePool(pool: PoolValue): void {
  write(SOURCE_POOL_STORAGE_KEY, pool);
}

export function loadLanesOpen(): boolean {
  const value = read(LANES_STORAGE_KEY);
  return value === null ? DEFAULT_LANES_OPEN : value === "1";
}

export function saveLanesOpen(open: boolean): void {
  write(LANES_STORAGE_KEY, open ? "1" : "0");
}

export const SUGGESTIONS_NOTE_STORAGE_KEY = "cuepoint-prepare-suggestions-note";

/** Whether Suggestions' ranking note has been shown already (PRP-7). */
export function hasSeenSuggestionsNote(): boolean {
  return read(SUGGESTIONS_NOTE_STORAGE_KEY) === "1";
}

export function saveSeenSuggestionsNote(): void {
  write(SUGGESTIONS_NOTE_STORAGE_KEY, "1");
}

export const TRANSITION_STORAGE_KEY = "cuepoint-prepare-transition";

/**
 * The transition strip starts hidden too (WAVE-07, DEC-120), for the same
 * reason: it takes three of the Set's rows, and PREP-10's rows hold as the
 * page opens.
 */
export const DEFAULT_TRANSITION_OPEN = false;

export function loadTransitionOpen(): boolean {
  const value = read(TRANSITION_STORAGE_KEY);
  return value === null ? DEFAULT_TRANSITION_OPEN : value === "1";
}

export function saveTransitionOpen(open: boolean): void {
  write(TRANSITION_STORAGE_KEY, open ? "1" : "0");
}
