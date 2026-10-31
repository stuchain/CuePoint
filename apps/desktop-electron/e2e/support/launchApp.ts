/**
 * The one place an end-to-end spec starts the app (HARDEN-09).
 *
 * A spec describes the development launch, as it always has: `cwd` the desktop folder and `args`
 * starting with ".". When `CUEPOINT_E2E_EXECUTABLE` names a packaged app, the same call starts that
 * executable instead: the working folder and the leading "." (the app's folder, which only the
 * development build needs) are dropped and everything else is kept. With the variable unset the
 * options pass through untouched, so a development run behaves as it did before the helper.
 *
 * Playwright is given the environment the spec builds, so the packaged app is started exactly as the
 * development one is: its own `--user-data-dir`, its own `CUEPOINT_HOME`.
 */
import { _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** What `electron.launch` takes, less the executable, which the helper chooses. */
type LaunchOptions = NonNullable<Parameters<typeof electron.launch>[0]>;
export type LaunchElectronOptions = Omit<LaunchOptions, "executablePath">;

/** The packaged executable the run was pointed at, or undefined for the development build. */
export function packagedExecutable(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.CUEPOINT_E2E_EXECUTABLE?.trim();
  return value ? value : undefined;
}

/**
 * The options Playwright is given. Pure, so it is unit tested (`launchApp.test.ts`).
 * `executable` is the packaged app, when there is one.
 */
export function launchPlan(options: LaunchElectronOptions, executable: string | undefined): LaunchOptions {
  if (!executable) return options;
  const { cwd: _cwd, args = [], ...rest } = options;
  return { ...rest, executablePath: executable, args: args[0] === "." ? args.slice(1) : args };
}

/** How old a leftover engine folder must be before a launch deletes it: an engine still ending is younger. */
export const STALE_ENGINE_COPY_MS = 60_000;

/**
 * The packaged engine's leftover unpacked copies (`_MEI*`) in `dir` older than `STALE_ENGINE_COPY_MS`.
 * Pure but for the listing, so it is unit tested (`launchApp.test.ts`).
 */
export function staleEngineCopies(
  dir: string,
  now: number,
  list: (dir: string) => Array<{ name: string; mtimeMs: number }> = listFolders,
): string[] {
  return list(dir)
    .filter((entry) => entry.name.startsWith("_MEI") && now - entry.mtimeMs > STALE_ENGINE_COPY_MS)
    .map((entry) => path.join(dir, entry.name));
}

function listFolders(dir: string): Array<{ name: string; mtimeMs: number }> {
  const found: Array<{ name: string; mtimeMs: number }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      found.push({ name: entry.name, mtimeMs: statSync(path.join(dir, entry.name)).mtimeMs });
    } catch {
      // Gone between the listing and the look.
    }
  }
  return found;
}

/**
 * On Windows the packaged engine unpacks itself into the temp folder at every start, and the app's
 * forced stop (`taskkill /F`) leaves that copy behind. A whole packaged suite starts the app about
 * 200 times, enough to fill the release runner's disk (test.5, 10-30), so each packaged launch first
 * deletes the copies earlier tests left.
 */
function deleteStaleEngineCopies(): void {
  for (const folder of staleEngineCopies(tmpdir(), Date.now())) {
    try {
      rmSync(folder, { recursive: true, force: true });
    } catch {
      // Still held by a process that has not ended: the next launch tries again.
    }
  }
}

export function launchElectron(options: LaunchElectronOptions): Promise<ElectronApplication> {
  const executable = packagedExecutable();
  if (executable && !existsSync(executable)) {
    // Say so, rather than let Playwright report a spawn error from deep inside its launcher.
    return Promise.reject(new Error(`CUEPOINT_E2E_EXECUTABLE names a file that does not exist: ${executable}`));
  }
  if (executable && process.platform === "win32") deleteStaleEngineCopies();
  return electron.launch(launchPlan(options, executable));
}
