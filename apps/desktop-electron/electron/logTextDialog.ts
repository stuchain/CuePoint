/**
 * "Save as text file…" for the Log viewer (M264, WO-8).
 *
 * The viewer used to hand the browser a download, named after whatever was in its search box.
 * This opens the native save dialog instead, with a name made safe on every system, and writes
 * the text the page sends to the file the person chose, and nowhere else: the page never names
 * a path, so it cannot ask for one to be written.
 *
 * - **The name is dated and sanitised**: `CuePoint log 2026-10-27.txt`, in local time. A label
 *   (the level, or the search) may follow "log"; it passes through the same rule as a Set's name
 *   in a set list's, so a search for `a/b:*?` is `a-b---`, never a path.
 * - **The text is bounded.** A log is read a page at a time and is never this big; a request
 *   above the limit is refused rather than written.
 * - **A cancelled dialog is an answer**, `{ canceled: true }`, and writes nothing.
 * - **Overwriting an existing file is the OS dialog's own confirmation.**
 *
 * Kept apart from `main.ts`, which cannot be imported without starting the app.
 */
import path from "node:path";
import type { SaveDialogOptions, SaveDialogReturnValue } from "electron";

import { setListFileStem } from "./setListDialog";

/** What the page asks for: the text to write and, optionally, a few words for the name. */
export interface LogTextSaveRequest {
  text: string;
  label?: string | null;
}

/** The dialog's answer: a file was written, or none was chosen. */
export type LogTextSaveResult = { canceled: true } | { canceled: false; filePath: string };

/** The most text one save writes (UTF-16 units): far above any log the viewer shows. */
export const LOG_TEXT_MAX_LENGTH = 20_000_000;

export const LOG_TEXT_DIALOG_TITLE = "Save log as text file";

export const LOG_TEXT_FILTERS: NonNullable<SaveDialogOptions["filters"]> = [
  { name: "Text file", extensions: ["txt"] },
];

export interface LogTextDialogDeps {
  showSaveDialog: (options: SaveDialogOptions) => Promise<SaveDialogReturnValue>;
  /** Writes the file; may throw, and the caller reports that. */
  writeFile: (filePath: string, text: string) => Promise<void> | void;
  /** Where the dialog opens. */
  fallbackFolder: () => string;
  now: () => Date;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** `CuePoint log 2026-10-27.txt`, or `CuePoint log errors 2026-10-27.txt` with a label. */
export function logTextFileName(label: unknown, now: Date): string {
  const date = `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
  const words = typeof label === "string" && label.trim() ? ` ${label}` : "";
  // The stem rule leaves "Set" for an empty name, so a label is added to a stem that is not empty.
  const stem = setListFileStem(`CuePoint log${words}`);
  return `${stem} ${date}.txt`;
}

/** The request as it must be, or null when it is not one. The page is not trusted. */
export function parseLogTextRequest(value: unknown): LogTextSaveRequest | null {
  if (!value || typeof value !== "object") return null;
  const { text, label } = value as { text?: unknown; label?: unknown };
  if (typeof text !== "string" || text.length > LOG_TEXT_MAX_LENGTH) return null;
  return { text, label: typeof label === "string" ? label : null };
}

/** A path with `.txt` on it when the person typed none. */
function withTextExtension(filePath: string): string {
  return path.extname(filePath) === "" ? `${filePath}.txt` : filePath;
}

/** Open the dialog, write the text to the file chosen, and say which, or that none was. */
export async function saveLogText(
  deps: LogTextDialogDeps,
  request: unknown,
): Promise<LogTextSaveResult> {
  const parsed = parseLogTextRequest(request);
  if (!parsed) throw new Error("The log text to save was not text, or was too large.");
  const result = await deps.showSaveDialog({
    title: LOG_TEXT_DIALOG_TITLE,
    buttonLabel: "Save",
    defaultPath: path.join(deps.fallbackFolder(), logTextFileName(parsed.label, deps.now())),
    filters: LOG_TEXT_FILTERS,
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const filePath = withTextExtension(result.filePath);
  await deps.writeFile(filePath, parsed.text);
  return { canceled: false, filePath };
}
