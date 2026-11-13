/**
 * B6: on Windows the packaged engine is a one-file PyInstaller build. It unpacks itself into the temp
 * folder (`%TEMP%\_MEI<n>`, about 70 MB) at every start, and the app stops it with `taskkill /F`, so
 * that copy is never deleted: a user's temp folder grew by one engine per quit.
 *
 * Once per start, after the window shows, the app deletes the copies earlier runs left. Only its own:
 * a folder counts as CuePoint's engine when it holds the build file the engine is packed with
 * (`cuepoint_build.json`), so another program's `_MEI` folder is never touched. Only when unused: the
 * folder is first renamed, which Windows refuses while any process has a file in it open (a running
 * engine has its DLLs loaded), and only a renamed folder is deleted. A copy younger than a minute is
 * left alone, since it may be the engine this start is unpacking.
 */
import fs from "node:fs";
import path from "node:path";

/** How old a copy must be before it is taken: an engine still unpacking is younger. */
export const STALE_ENGINE_COPY_MS = 60_000;

/** The file every packaged engine carries at the root of its unpacked copy (`build/engine-sidecar.spec`). */
export const ENGINE_MARKER = "cuepoint_build.json";

/** A taken copy is renamed to this before it is deleted, so a delete cut short is found next time. */
const TAKEN_SUFFIX = ".cuepoint-old";

export interface TempEntry {
  name: string;
  mtimeMs: number;
  /** The folder holds `ENGINE_MARKER`. */
  engine: boolean;
}

/**
 * The folders in the temp listing to take: CuePoint engine copies older than a minute, and any copy
 * an earlier sweep renamed but did not finish deleting. Pure, so it is unit tested.
 */
export function staleEngineCopies(entries: readonly TempEntry[], now: number): string[] {
  return entries
    .filter(
      (entry) =>
        (entry.name.startsWith("_MEI") && entry.name.endsWith(TAKEN_SUFFIX)) ||
        (/^_MEI\d+$/.test(entry.name) && entry.engine && now - entry.mtimeMs > STALE_ENGINE_COPY_MS),
    )
    .map((entry) => entry.name);
}

function listTemp(dir: string): TempEntry[] {
  const found: TempEntry[] = [];
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of names) {
    if (!entry.isDirectory() || !entry.name.startsWith("_MEI")) continue;
    const full = path.join(dir, entry.name);
    try {
      found.push({ name: entry.name, mtimeMs: fs.statSync(full).mtimeMs, engine: fs.existsSync(path.join(full, ENGINE_MARKER)) });
    } catch {
      // Gone between the listing and the look.
    }
  }
  return found;
}

/**
 * Deletes the stale engine copies in `dir` (the temp folder); answers the names it deleted. Never
 * rejects: a copy in use, or one that cannot be deleted now, is left for the next start. The delete is
 * asynchronous, so a temp folder holding many copies never holds up the window.
 */
export async function sweepEngineCopies(
  dir: string,
  now: number = Date.now(),
  platform: NodeJS.Platform = process.platform,
): Promise<string[]> {
  if (platform !== "win32") return [];
  const deleted: string[] = [];
  for (const name of staleEngineCopies(listTemp(dir), now)) {
    const from = path.join(dir, name);
    const taken = name.endsWith(TAKEN_SUFFIX) ? from : from + TAKEN_SUFFIX;
    try {
      // Refused while a process holds a file inside: then the copy is in use and stays.
      if (taken !== from) fs.renameSync(from, taken);
      await fs.promises.rm(taken, { recursive: true, force: true });
      deleted.push(name);
    } catch {
      // In use, or held for a moment: the next start tries again.
    }
  }
  return deleted;
}
