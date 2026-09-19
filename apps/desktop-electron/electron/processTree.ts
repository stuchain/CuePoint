/**
 * Stopping a sidecar and everything it started (CLEAN-14).
 *
 * The packaged engine is a one-file PyInstaller build: a bootloader that
 * unpacks the engine and runs it as its own child. On Windows, terminating the
 * bootloader — which is all `ChildProcess.kill()` does there — leaves that
 * child running: still listening on its port, still holding the library
 * database and its log, after the app has quit. Every launch and every quit of
 * the packaged app left one more behind. `scripts/build_engine_sidecar.py`
 * met the same thing in its smoke test and stops the tree with `taskkill /T`;
 * this is the app's half of that.
 *
 * Elsewhere the bootloader forwards the signal to its child, so a signal to the
 * process is enough and stays what it was.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

export interface Killable {
  pid?: number;
  kill: (signal?: NodeJS.Signals | number) => boolean;
}

export type RunSync = (command: string, args: string[]) => Pick<SpawnSyncReturns<Buffer>, "status" | "error">;

const runSync: RunSync = (command, args) =>
  spawnSync(command, args, { stdio: "ignore", windowsHide: true });

/**
 * Stop a process and, on Windows, every process it started.
 *
 * `force` is the second attempt: SIGKILL where signals exist. On Windows
 * `taskkill /F` is already forceful, so both attempts are the same command.
 * Falls back to `kill()` when the tree could not be stopped — no pid, or
 * `taskkill` missing — so a stop never does less than it did before.
 */
export function stopProcessTree(
  proc: Killable,
  { force = false, platform = process.platform, run = runSync }: {
    force?: boolean;
    platform?: NodeJS.Platform;
    run?: RunSync;
  } = {},
): void {
  if (platform === "win32" && proc.pid) {
    const result = run("taskkill", ["/T", "/F", "/PID", String(proc.pid)]);
    if (!result.error && result.status === 0) return;
  }
  try {
    proc.kill(force ? "SIGKILL" : undefined);
  } catch {
    // Already gone.
  }
}
