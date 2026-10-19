/**
 * The shared words (consistency areas 28 to 31): one name for each action, one wording for
 * each message. A screen that needs one of these imports it rather than writing its own.
 *
 * The rules every sentence follows: it ends with a period; it talks to "you"; it never says
 * "Please"; it says "could not", not "couldn't"; names are in curly quotes; a label that
 * opens a dialog ends in "…" (add it with `opensDialog`); a menu button is a noun and an
 * arrow, with no "…".
 */
import { countNoun, formatCount } from "./counts";

export { NO_VALUE, NOT_SET } from "../words";

// ---------------------------------------------------------------- action labels

export const MATCH_ON_BEATPORT = "Match on Beatport";
export const SYNC_TO_FILES = "Sync to files";
export const SAVE_TO_FILES = SYNC_TO_FILES;
/** The same words for the glossary's retired verbs: Write and Save are gone, Sync is the one (D3). */
export const SYNC = {
  /** The button that opens the Sync dialog. */
  opener: opensDialog(SYNC_TO_FILES),
  /** The dialog's title. */
  title: (count: number) => `Sync ${countNoun(count, "track")} to your files`,
  /** The main button. */
  button: (count: number) => `Sync ${countNoun(count, "file")}`,
  /** Nothing is waiting to be synced. */
  empty: "Nothing to sync",
  /** The finished toast and Activity line. */
  done: (count: number) => `Synced ${countNoun(count, "file")}`,
  /** The strip while it runs. */
  running: "Syncing to files",
} as const;
/** The header state of a library whose files match its data (it was "In sync"). */
export const UP_TO_DATE = "Up to date";
export const OPEN_LOG_FOLDER = "Open log folder";
/** The retry button everywhere (it was "Try again" in about 30 places, plus other wordings). */
export const RETRY = "Try again";
export const TRY_AGAIN = RETRY;
export const UNDO = "Undo";
export const BACK = "Back";
export const CREATE = "Create";
/** The word for taking values to the clipboard, in every menu and button. */
export const COPY_VALUES = "Copy";
export const CHECK_FOR_CHANGES = "Check for changes";
export const ADD_TO_BEATPORT_PLAYLIST = "Add to a Beatport playlist…";
export const ARTWORK = "Artwork";
export const KEY_NOTATION = "Key notation";
export const STATUS_STRIP = "status strip";
export const SHOW_LESS = "Show less";

/** The six states of a Beatport match, as the page names them (D2). */
export const MATCH_STATE = {
  confirmed: "Confirmed",
  toCheck: "To check",
  noMatch: "No match",
  notLookedUp: "Not looked up yet",
  rejected: "Rejected",
  searchFailed: "Search failed",
} as const;
/** The button that agrees with a proposed match (it was "Use this", "Confirm"). */
export const USE_MATCH = "Use this match";
/** "1 no match", "12 no match": the number of searches that found nothing (it was "1 not found"). */
export function noMatchCount(count: number, locale?: string): string {
  return `${formatCount(count, locale)} no match`;
}

/** "Show all 24": the quiet button that opens a list that was cut short. */
export function showAll(count: number, locale?: string): string {
  return `Show all ${formatCount(count, locale)}`;
}

/** What an empty list of Collections or Sets says, everywhere it is shown. */
export const NO_COLLECTIONS = "No Collections yet";
export const NO_SETS = "No Sets yet";

/** The toast text after taking tracks out of a list; it carries an `UNDO` action. */
export function removedFrom(count: number, name: string): string {
  return `Removed ${countNoun(count, "track")} from ${quoted(name)}`;
}
export const CANCEL = "Cancel";
export const CLEAR_SEARCH = "Clear the search";

/** A label that opens a dialog ends in "…"; one that already does is left alone. */
export function opensDialog(label: string): string {
  return label.endsWith("…") ? label : `${label}…`;
}

/**
 * "Open in Keys": the one wording for a button that goes to another page. The chevron after it
 * is drawn by the `.cp-link--go` class, never typed.
 */
export function goTo(page: string): string {
  return `Open in ${page}`;
}

/** "Delete Set" for the red button of a delete dialog. */
export function deleteLabel(thing: string): string {
  return `Delete ${thing}`;
}

/**
 * The title of a delete dialog: `Delete “Warm-up”?` when the thing has a name, `Delete Set?` when
 * only its kind is known (C165).
 */
export function deleteTitle(kind: string, name?: string): string {
  return name ? `Delete ${quoted(name)}?` : `Delete ${kind}?`;
}

/** The first line of every delete dialog's body. */
export const deleteLead = "This cannot be undone.";

/** "Show 4A on the Camelot wheel": the hint on a key chip that opens the wheel. */
export function showOnWheel(key: string): string {
  return `Show ${key} on the Camelot wheel`;
}

// ---------------------------------------------------------------------- quotes

/** A name in curly quotes: “Warm-up”. One that is already quoted is left alone. */
export function quoted(name: string): string {
  if (name.length > 1 && name.startsWith("\u201c") && name.endsWith("\u201d")) return name;
  return `\u201c${name}\u201d`;
}

/** The one line for a search or filter that found nothing: Nothing matches “house”. */
export function nothingMatches(query: string): string {
  return `Nothing matches ${quoted(query)}.`;
}

// ------------------------------------------------------------ technical sentences

/**
 * Replaces "Failed to…": "Could not clear the cache." With a name it is quoted:
 * `couldNot("rename", "Warm-up")` is `Could not rename “Warm-up”.`
 */
export function couldNot(action: string, name?: string): string {
  return name ? `Could not ${action} ${quoted(name)}.` : `Could not ${action}.`;
}

/** CuePoint's background part has stopped; said in plain words, with no mention of processes. */
export const LOST_TOUCH = "CuePoint stopped responding. Nothing was changed.";
export const LOST_TOUCH_PARTWAY =
  "CuePoint stopped responding partway through. Activity shows what was done.";

/** The waveform analysis cannot run in this version of the app. */
export const WAVEFORMS_UNAVAILABLE = "Waveforms are not available in this version of CuePoint.";

// ---------------------------------------------------------------- dialog titles

/**
 * The title of the dialog an action opens: the opener's own words without its "…", and a name
 * the user typed in curly quotes. `dialogTitle("Rename…", "Build")` is `Rename “Build”`;
 * `dialogTitle("New Set from…")` is `New Set from`. A title repeats the button that opened it.
 */
export function dialogTitle(opener: string, name?: string): string {
  const words = opener.replace(/(…|\.{3})\s*$/, "").trim();
  return name === undefined || name === "" ? words : `${words} ${quoted(name)}`;
}
