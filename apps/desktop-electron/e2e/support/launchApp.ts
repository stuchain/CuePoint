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
import { existsSync } from "node:fs";

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

export function launchElectron(options: LaunchElectronOptions): Promise<ElectronApplication> {
  const executable = packagedExecutable();
  if (executable && !existsSync(executable)) {
    // Say so, rather than let Playwright report a spawn error from deep inside its launcher.
    return Promise.reject(new Error(`CUEPOINT_E2E_EXECUTABLE names a file that does not exist: ${executable}`));
  }
  return electron.launch(launchPlan(options, executable));
}
