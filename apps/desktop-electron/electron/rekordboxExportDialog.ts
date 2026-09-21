/**
 * The save dialog for a Rekordbox export (EXPORT-06, DEC-083).
 *
 * The dialog is Electron's and the rule is Python's. This picks where the
 * dialog starts and what it suggests; it never decides whether the chosen path
 * may be written. That is the engine's to say when the export starts, because a
 * check in the shell is a suggestion and the one mistake it guards against — a
 * collection written over its own source — costs a user their library.
 *
 * - **Only the folder is remembered, never the file name**, so no export
 *   silently overwrites the previous one. The folder is the one the last export
 *   that wrote went to, read from the engine's record rather than kept here:
 *   the shell holds no path of its own, and the record cannot drift from it.
 * - **The name is dated**: `CuePoint Export YYYY-MM-DD.xml`, in local time,
 *   because that is the date on the person's calendar when they exported.
 * - **Overwriting another existing file is the OS dialog's own confirmation**,
 *   not a second one here.
 * - **A cancelled dialog is an answer**, `{ canceled: true }`, and starts
 *   nothing: this module has no way to start an export.
 *
 * Kept apart from `main.ts`, which cannot be imported without starting the app,
 * so the dialog's options can be tested.
 */
import path from "node:path";
import type { SaveDialogOptions, SaveDialogReturnValue } from "electron";

import type { RekordboxExportDestinationChoice, RekordboxExportHistory } from "./engineClient";

/** The one kind of file an export writes. */
export const REKORDBOX_EXPORT_FILTERS: SaveDialogOptions["filters"] = [
  { name: "Rekordbox XML", extensions: ["xml"] },
];

export const REKORDBOX_EXPORT_DIALOG_TITLE = "Export to Rekordbox";

/** What the dialog needs from outside it, handed in so a test can stand in. */
export interface RekordboxExportDialogDeps {
  /** The engine's export history; only `remembered` is read. */
  history: () => Promise<Pick<RekordboxExportHistory, "remembered">>;
  /** Where to start when nothing is remembered, or it is gone. */
  fallbackFolder: () => string;
  showSaveDialog: (options: SaveDialogOptions) => Promise<SaveDialogReturnValue>;
  now: () => Date;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** `CuePoint Export 2026-09-21.xml`, dated in local time. */
export function rekordboxExportFileName(now: Date): string {
  const date = `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
  return `CuePoint Export ${date}.xml`;
}

/**
 * A previous choice worth reopening at: an absolute path to an `.xml` file.
 * Anything else is ignored rather than refused — it only decides where the
 * dialog opens, and the person still chooses.
 */
function previousChoice(currentPath: unknown): string | null {
  if (typeof currentPath !== "string" || !currentPath.trim()) return null;
  if (!path.isAbsolute(currentPath)) return null;
  if (path.extname(currentPath).toLowerCase() !== ".xml") return null;
  return currentPath;
}

/**
 * The folder the last export that wrote went to, when it is still there. An
 * engine that cannot answer is not a reason to refuse to open a dialog.
 */
async function rememberedFolder(deps: RekordboxExportDialogDeps): Promise<string | null> {
  try {
    const { remembered } = await deps.history();
    return remembered.folder && remembered.folder_exists ? remembered.folder : null;
  } catch {
    return null;
  }
}

/** Everything the dialog is opened with. */
export async function rekordboxExportDialogOptions(
  deps: RekordboxExportDialogDeps,
  request?: { currentPath?: string | null } | null,
): Promise<SaveDialogOptions> {
  const previous = previousChoice(request?.currentPath);
  const defaultPath = previous
    ? previous
    : path.join(
        (await rememberedFolder(deps)) ?? deps.fallbackFolder(),
        rekordboxExportFileName(deps.now()),
      );
  return {
    title: REKORDBOX_EXPORT_DIALOG_TITLE,
    buttonLabel: "Choose",
    defaultPath,
    filters: REKORDBOX_EXPORT_FILTERS,
    properties: ["createDirectory", "showOverwriteConfirmation"],
  };
}

/** Open the dialog and answer with the file chosen, or that none was. */
export async function chooseRekordboxExportDestination(
  deps: RekordboxExportDialogDeps,
  request?: { currentPath?: string | null } | null,
): Promise<RekordboxExportDestinationChoice> {
  const result = await deps.showSaveDialog(await rekordboxExportDialogOptions(deps, request));
  if (result.canceled || !result.filePath) return { canceled: true };
  return { canceled: false, filePath: result.filePath };
}
