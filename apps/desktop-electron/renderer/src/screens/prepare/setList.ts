/**
 * A set list, saved or copied, in words (DEC-110; PREP-09 draws it in the
 * Library's tree, PREP-11 on the Prepare page).
 *
 * The saved line says what the engine's `set_list.saved` activity event says,
 * "Saved “Friday” as a CSV set list — 4 entries, 1 file missing, 2 untimed", so
 * the toast and Activity never tell two stories about one file. An M3U8 holds
 * no times (DEC-110), so it does not count the entries it has none for.
 *
 * Pure, and kept apart from the hook that runs the dialog, because the words
 * are the part a test can pin and a component test can only glimpse.
 */
import type { SetListFormat, SetListSaved, SetRefusal } from "../../api/cuepointBridge.types";

/** Each form, as the sentence names it: "as a CSV set list". */
const FORM_WORDS: Record<SetListFormat, string> = {
  text: "a text",
  csv: "a CSV",
  m3u8: "an M3U8",
};

function counted(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/** What a save wrote, for the toast. */
export function setListSavedLine(setName: string, saved: SetListSaved): string {
  const parts = [counted(saved.entries, "entry", "entries")];
  if (saved.missing_files > 0) {
    parts.push(`${counted(saved.missing_files, "file", "files")} missing`);
  }
  if (saved.untimed > 0 && saved.format !== "m3u8") {
    parts.push(`${saved.untimed.toLocaleString()} untimed`);
  }
  return `Saved “${setName}” as ${FORM_WORDS[saved.format]} set list — ${parts.join(", ")}.`;
}

/** What a copy put on the clipboard. */
export function setListCopiedLine(setName: string): string {
  return `Copied the set list for “${setName}”.`;
}

/** Said when the clipboard refuses, which the web API does without a reason. */
export const CLIPBOARD_REFUSED = "Could not copy to the clipboard.";

/** Said when the shell has no `sets` namespace: a browser tab, an older shell. */
export const NO_SET_LISTS = "Set lists need the desktop app with CuePoint's library service running.";

/**
 * Whether a refused save should reopen the dialog (PREP-08).
 *
 * A destination the engine refused, or a file system that would not write
 * there, both have the same next step: another place. The dialog reopens at
 * the file refused, and the reason is said beside it. Anything else — the Set
 * gone, a request refused — ends the save, because no other place fixes it.
 */
export function reopensDialog(refusal: SetRefusal): boolean {
  return (
    refusal.code === "SET_LIST_DESTINATION_REFUSED" || refusal.code === "SET_LIST_WRITE_FAILED"
  );
}
