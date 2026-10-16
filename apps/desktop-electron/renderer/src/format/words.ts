/**
 * The shared words (consistency areas 28 to 31): one name for each action, one wording for
 * each message. A screen that needs one of these imports it rather than writing its own.
 *
 * The rules every sentence follows: it ends with a period; it talks to "you"; it never says
 * "Please"; it says "could not", not "couldn't"; names are in curly quotes; a label that
 * opens a dialog ends in "…" (add it with `opensDialog`); a menu button is a noun and an
 * arrow, with no "…".
 */
export { NO_VALUE, NOT_SET } from "../words";

// ---------------------------------------------------------------- action labels

export const MATCH_ON_BEATPORT = "Match on Beatport";
export const SYNC_TO_FILES = "Sync to files";
export const SAVE_TO_FILES = SYNC_TO_FILES;
export const OPEN_LOG_FOLDER = "Open log folder";
/** The retry button everywhere (it was "Try again" in about 30 places, plus other wordings). */
export const RETRY = "Try again";
export const UNDO = "Undo";
export const CANCEL = "Cancel";
export const CLEAR_SEARCH = "Clear the search";

/** A label that opens a dialog ends in "…"; one that already does is left alone. */
export function opensDialog(label: string): string {
  return label.endsWith("…") ? label : `${label}…`;
}

/** "Open in Keys ›": the one wording for a button that goes to another page. */
export function goTo(page: string): string {
  return `Open in ${page} ›`;
}

/** "Delete Set" for the red button of a delete dialog. */
export function deleteLabel(thing: string): string {
  return `Delete ${thing}`;
}

/** "Delete Set?" for the title of a delete dialog. */
export function deleteTitle(thing: string): string {
  return `Delete ${thing}?`;
}

/** "Show 4A on the Camelot wheel": the hint on a key chip that opens the wheel. */
export function showOnWheel(key: string): string {
  return `Show ${key} on the Camelot wheel`;
}

// ---------------------------------------------------------------------- quotes

/** A name in curly quotes: “Warm-up”. */
export function quoted(name: string): string {
  return `\u201c${name}\u201d`;
}

/** The one line for a search or filter that found nothing: Nothing matches “house”. */
export function nothingMatches(query: string): string {
  return `Nothing matches ${quoted(query)}.`;
}

// ------------------------------------------------------------ technical sentences

/** Replaces "This build cannot…": a window with no desktop app behind it. */
export function needsDesktopApp(action: string): string {
  return `You can only ${action} in the CuePoint desktop app.`;
}

/** Replaces "Failed to…": "Could not clear the cache." */
export function couldNot(action: string): string {
  return `Could not ${action}.`;
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
