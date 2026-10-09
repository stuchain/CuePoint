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

import { parseVersion } from "./updateRule";

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
}

function defaults(): MainSettings {
  return { setListFolder: null, errorReporting: true, lastCheckedAt: null, lastSeenVersion: null, pendingInstall: null };
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

  /** Change some settings, keeping the rest, and write the file whole. */
  update(patch: Partial<MainSettings>): MainSettings {
    const next: MainSettings = { ...this.read(), ...patch };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      fs.renameSync(temporary, this.file);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
    return next;
  }
}
