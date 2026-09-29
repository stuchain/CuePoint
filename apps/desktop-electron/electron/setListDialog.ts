/**
 * The save dialog for a set list (PREP-08, DEC-110).
 *
 * The dialog is Electron's and the rule is Python's, as the Rekordbox export's
 * is (EXPORT-06). This picks where the dialog opens and what it suggests; it
 * never decides whether the chosen path may be written. The engine says that
 * when it saves, before it reads anything, and says why in a reason the
 * renderer can act on.
 *
 * - **The name is the Set's and today's**: `Friday 2026-09-29.txt`, dated in
 *   local time, with any character a file name cannot hold replaced. Text is
 *   the default form; the three forms are the dialog's filters, and the
 *   extension chosen is the form written.
 * - **Only the folder is remembered, never the file name**, so no save
 *   silently replaces the last one. It is the folder the last set list was
 *   *saved* to, remembered when the engine says it wrote the file, not when a
 *   dialog closed: a path the engine refused is not a place set lists go. It
 *   lives in main's own settings (`mainSettings.ts`), because nothing records
 *   a set list save but its activity event.
 * - **Overwriting an existing file is the OS dialog's own confirmation.**
 * - **A cancelled dialog is an answer**, `{ canceled: true }`, and saves
 *   nothing: this module has no way to save.
 *
 * Kept apart from `main.ts`, which cannot be imported without starting the app,
 * so the dialog's options can be tested.
 */
import fs from "node:fs";
import path from "node:path";
import type { SaveDialogOptions, SaveDialogReturnValue } from "electron";

import type {
  SetAnswer,
  SetListDestinationChoice,
  SetListDialogRequest,
  SetListSave,
} from "./engineClient";
import type { MainSettingsStore } from "./mainSettings";

/** The three forms, in the order the dialog offers them; text first. */
export const SET_LIST_FILTERS: NonNullable<SaveDialogOptions["filters"]> = [
  { name: "Text set list", extensions: ["txt"] },
  { name: "CSV set list", extensions: ["csv"] },
  { name: "M3U8 playlist", extensions: ["m3u8"] },
];

export const SET_LIST_DIALOG_TITLE = "Save set list";

/** Where set lists go: the folder of the last one saved. */
export interface SetListFolderStore {
  folder: () => string | null;
  remember: (folder: string) => void;
}

/** What the dialog needs from outside it, handed in so a test can stand in. */
export interface SetListDialogDeps {
  store: Pick<SetListFolderStore, "folder">;
  /** Whether a remembered folder is still there to open at. */
  folderExists: (folder: string) => boolean;
  /** Where to open when nothing is remembered, or it is gone. */
  fallbackFolder: () => string;
  showSaveDialog: (options: SaveDialogOptions) => Promise<SaveDialogReturnValue>;
  now: () => Date;
}

/** The set list dialog's view of main's settings. */
export function setListFolderStore(settings: MainSettingsStore): SetListFolderStore {
  return {
    folder: () => settings.read().setListFolder,
    remember: (folder) => {
      settings.update({ setListFolder: folder });
    },
  };
}

/** True for a folder that is there now. */
export function isFolder(folder: string): boolean {
  try {
    return fs.statSync(folder).isDirectory();
  } catch {
    return false;
  }
}

// Characters no file name may hold on Windows, where the rules are strictest,
// and control characters everywhere. A Set called "Friday 2/10" is saved as
// "Friday 2-10 …", not refused.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_STEM = 100;

/** The Set's name as the start of a file name: safe on every system, never empty. */
export function setListFileStem(setName: unknown): string {
  const text = typeof setName === "string" ? setName : "";
  const trimmed = (value: string) => value.replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
  let stem = trimmed(text.replace(UNSAFE, "-"));
  if (stem.length > MAX_STEM) stem = trimmed(stem.slice(0, MAX_STEM));
  if (!stem) return "Set";
  // Windows reserves these as names, whatever follows a dot.
  return RESERVED.test(stem.split(".")[0]!.trim()) ? `Set ${stem}` : stem;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/** `Friday 2026-09-29.txt`, dated in local time. */
export function setListFileName(setName: unknown, now: Date): string {
  const date = `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
  return `${setListFileStem(setName)} ${date}.txt`;
}

const EXTENSIONS = new Set(SET_LIST_FILTERS.flatMap((filter) => filter.extensions.map((e) => `.${e}`)));

/**
 * A previous choice worth reopening at, after the engine refused it: an
 * absolute path to a set list. Anything else is ignored rather than refused —
 * it only decides where the dialog opens, and the person still chooses.
 */
function previousChoice(currentPath: unknown): string | null {
  if (typeof currentPath !== "string" || !currentPath.trim()) return null;
  if (!path.isAbsolute(currentPath)) return null;
  if (!EXTENSIONS.has(path.extname(currentPath).toLowerCase())) return null;
  return currentPath;
}

/** The folder the last set list went to, when it is still there. */
function rememberedFolder(deps: SetListDialogDeps): string | null {
  try {
    const folder = deps.store.folder();
    return folder && deps.folderExists(folder) ? folder : null;
  } catch {
    return null;
  }
}

/** Everything the dialog is opened with. */
export function setListDialogOptions(
  deps: SetListDialogDeps,
  request?: Partial<SetListDialogRequest> | null,
): SaveDialogOptions {
  const previous = previousChoice(request?.currentPath);
  const defaultPath =
    previous ??
    path.join(
      rememberedFolder(deps) ?? deps.fallbackFolder(),
      setListFileName(request?.setName, deps.now()),
    );
  return {
    title: SET_LIST_DIALOG_TITLE,
    buttonLabel: "Save",
    defaultPath,
    filters: SET_LIST_FILTERS,
    properties: ["createDirectory", "showOverwriteConfirmation"],
  };
}

/** Open the dialog and answer with the file chosen, or that none was. */
export async function chooseSetListDestination(
  deps: SetListDialogDeps,
  request?: Partial<SetListDialogRequest> | null,
): Promise<SetListDestinationChoice> {
  const result = await deps.showSaveDialog(setListDialogOptions(deps, request));
  if (result.canceled || !result.filePath) return { canceled: true };
  return { canceled: false, filePath: result.filePath };
}

/**
 * Pass a save's answer through, remembering the folder when the engine wrote
 * the file. A refusal remembers nothing, and a folder that cannot be
 * remembered only means the next dialog opens somewhere else: the save itself
 * is never failed for it.
 */
export async function rememberSetListFolder(
  answer: Promise<SetAnswer<SetListSave>>,
  store: Pick<SetListFolderStore, "remember">,
): Promise<SetAnswer<SetListSave>> {
  const result = await answer;
  if (result.value) {
    try {
      store.remember(path.dirname(result.value.saved.path));
    } catch {
      // Where the next dialog opens is a convenience, not part of the save.
    }
  }
  return result;
}
