/**
 * What the main process remembers for itself (PREP-08).
 *
 * One small JSON file in the app's user-data folder. It holds conveniences the
 * shell owns, never library data: those are the engine's, in its database,
 * with their history. The first is the folder a set list was last saved to,
 * which is where the next set list dialog opens. Nothing records a set list
 * save but its activity event (DEC-110), so unlike the Rekordbox export's
 * folder (DEC-086) there is no engine record to read it back from.
 *
 * The window's last size, place and maximised state, and the theme colour it last had, live here
 * too (M491, M492): both are read before the window is made.
 *
 * The updater's two notes live here too (DIST-06): when it last checked, and
 * the version "What's new" was last shown for.
 *
 * It also holds the error-reporting choice (REPORT-01, DEC-128), which main
 * owns because main starts first and starts everything else.
 *
 * Reading never fails: a missing, unreadable or hand-edited file reads as the
 * defaults, because a remembered folder only decides where a dialog opens. A
 * broken file reads as error reporting on, as a first launch does (DEC-128).
 * Writing replaces the file whole, through a temporary file beside it, so a
 * crash mid-write leaves the old settings rather than half of the new ones.
 *
 * Kept apart from `main.ts`, which cannot be imported without starting the
 * app, so it can be tested.
 */
import fs from "node:fs";
import path from "node:path";

import { writeAtomicSync } from "./atomicWrite";
import { parseVersion } from "./updateRule";
import { parseWindowState, type WindowState } from "./windowSize";
import { parseWindowTheme, type WindowTheme } from "./windowTheme";

/** The file's name, in `app.getPath("userData")`. */
export const MAIN_SETTINGS_FILE = "main-settings.json";

interface MainSettings {
  /** The folder the last set list was saved to, absolute; null before the first. */
  setListFolder: string | null;
  /** Whether error reports may be sent; on from the first launch (DEC-128). */
  errorReporting: boolean;
  /** When the updater last finished a check, as an ISO date; null before the first (DIST-06). */
  lastCheckedAt: string | null;
  /**
   * The version the person last saw "What's new" for, in the release scheme; null on a first
   * install or the first build with the updater, which offers nothing (DEC-172).
   */
  lastSeenVersion: string | null;
  /**
   * The version an install was just handed to (the Mac script, Windows' installer), written
   * before the hand-off and cleared at the next launch once the running version has caught up.
   * One still set while the app is older means the install failed (DIST-06).
   */
  pendingInstall: string | null;
  /**
   * Where the window was and how big when it was last closed, and whether it was maximised, so the
   * next launch opens the same (M491). Null before the first close.
   */
  windowState: WindowState | null;
  /**
   * The app theme's background and scheme as the page last reported them, so the next window is
   * made already in that colour rather than flashing white (M492). Null before the first report.
   */
  windowTheme: WindowTheme | null;
  /**
   * The folders exports were last saved to, newest first, at most `MAX_EXPORT_FOLDERS`, so the
   * next start can sweep what a killed write left in them (HARDEN-04).
   */
  lastExportFolders: string[];
  /**
   * When a `quick_check` of the library last finished and passed, as an ISO date; null before the
   * first. The next one is due 7 days later, or after an unclean exit (HARDEN-03, DEC-181).
   */
  lastIntegrityCheckAt: string | null;
  /**
   * An unclean exit was seen and the check it owes has not finished yet. Kept in the file, so a
   * quit or a crash before the check ran does not forget it; cleared only when a check finishes,
   * passing or failing (HARDEN-03).
   */
  integrityCheckOwed: boolean;
}

/** How many export folders are remembered. */
export const MAX_EXPORT_FOLDERS = 5;

function defaults(): MainSettings {
  return {
    setListFolder: null,
    errorReporting: true,
    lastCheckedAt: null,
    lastSeenVersion: null,
    pendingInstall: null,
    windowState: null,
    windowTheme: null,
    lastExportFolders: [],
    lastIntegrityCheckAt: null,
    integrityCheckOwed: false,
  };
}

/** An ISO 8601 date-time text, kept as it was written; anything else is null. */
function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/** `X.Y.Z` or `X.Y.Z-test.N` with no `v`, else null. */
function schemeVersion(value: unknown): string | null {
  return typeof value === "string" && !value.startsWith("v") && parseVersion(value) ? value : null;
}

/** Absolute folder names, no repeats, at most `MAX_EXPORT_FOLDERS`; anything else is dropped. */
function exportFolders(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const folders: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && path.isAbsolute(item) && !folders.includes(item)) folders.push(item);
  }
  return folders.slice(0, MAX_EXPORT_FOLDERS);
}

/** The settings a file's text holds; anything unreadable reads as the default. */
export function parseMainSettings(text: string): MainSettings {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return defaults();
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return defaults();
  const record = data as Record<string, unknown>;
  const folder = record.setListFolder;
  const reporting = record.errorReporting;
  return {
    setListFolder: typeof folder === "string" && path.isAbsolute(folder) ? folder : null,
    errorReporting: typeof reporting === "boolean" ? reporting : true,
    lastCheckedAt: isoDate(record.lastCheckedAt),
    lastSeenVersion: schemeVersion(record.lastSeenVersion),
    pendingInstall: schemeVersion(record.pendingInstall),
    windowState: parseWindowState(record.windowState),
    windowTheme: parseWindowTheme(record.windowTheme),
    lastExportFolders: exportFolders(record.lastExportFolders),
    lastIntegrityCheckAt: isoDate(record.lastIntegrityCheckAt),
    integrityCheckOwed: record.integrityCheckOwed === true,
  };
}

export class MainSettingsStore {
  constructor(private readonly file: string) {}

  /** The settings as they are now; the defaults when there are none. */
  read(): MainSettings {
    try {
      return parseMainSettings(fs.readFileSync(this.file, "utf8"));
    } catch {
      return defaults();
    }
  }

  /** Remember a folder an export went to, newest first, keeping the last few. */
  rememberExportFolder(folder: string): void {
    if (!path.isAbsolute(folder)) return;
    const others = this.read().lastExportFolders.filter((known) => known !== folder);
    this.update({ lastExportFolders: [folder, ...others].slice(0, MAX_EXPORT_FOLDERS) });
  }

  /** Change some settings, keeping the rest, and write the file whole. */
  update(patch: Partial<MainSettings>): MainSettings {
    const next: MainSettings = { ...this.read(), ...patch };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    writeAtomicSync(this.file, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }
}
