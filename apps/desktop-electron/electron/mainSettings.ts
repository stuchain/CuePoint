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
 * Reading never fails: a missing, unreadable or hand-edited file reads as the
 * defaults, because a remembered folder only decides where a dialog opens.
 * Writing replaces the file whole, through a temporary file beside it, so a
 * crash mid-write leaves the old settings rather than half of the new ones.
 *
 * Kept apart from `main.ts`, which cannot be imported without starting the
 * app, so it can be tested.
 */
import fs from "node:fs";
import path from "node:path";

/** The file's name, in `app.getPath("userData")`. */
export const MAIN_SETTINGS_FILE = "main-settings.json";

interface MainSettings {
  /** The folder the last set list was saved to, absolute; null before the first. */
  setListFolder: string | null;
}

function defaults(): MainSettings {
  return { setListFolder: null };
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
  const folder = (data as Record<string, unknown>).setListFolder;
  return {
    setListFolder: typeof folder === "string" && path.isAbsolute(folder) ? folder : null,
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
