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
 * Elsewhere the bootloader forwards SIGTERM to its child, so the first, polite
 * stop is a signal to the process and stays what it was. SIGKILL cannot be
 * forwarded: killing only the bootloader leaves the real engine running, and
 * because it watches Electron rather than the bootloader it stays up, holding
 * the library database. The forced stop therefore kills the descendants too
 * (found by the packaged heartbeat spec, HARDEN-09).
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

/** Every `[pid, parent pid]` pair on the machine, or none when they cannot be listed. */
export type ListProcesses = () => Array<[number, number]>;

interface Killable {
  pid?: number;
  kill: (signal?: NodeJS.Signals | number) => boolean;
}

export type RunSync = (command: string, args: string[]) => Pick<SpawnSyncReturns<Buffer>, "status" | "error">;

const runSync: RunSync = (command, args) =>
  spawnSync(command, args, { stdio: "ignore", windowsHide: true });

const listProcesses: ListProcesses = () => {
  const result = spawnSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") return [];
  const pairs: Array<[number, number]> = [];
  for (const line of result.stdout.split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (Number.isInteger(pid) && Number.isInteger(ppid)) pairs.push([pid!, ppid!]);
  }
  return pairs;
};

/** Every process below `root`, deepest last, found before anything is killed (a kill re-parents them). */
export function descendantsOf(root: number, pairs: Array<[number, number]>): number[] {
  const found: number[] = [];
  const seen = new Set<number>([root]);
  for (let queue = [root]; queue.length; ) {
    const next: number[] = [];
    for (const parent of queue) {
      for (const [pid, ppid] of pairs) {
        if (ppid === parent && !seen.has(pid)) {
          seen.add(pid);
          found.push(pid);
          next.push(pid);
        }
      }
    }
    queue = next;
  }
  return found;
}

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
  { force = false, platform = process.platform, run = runSync, processes = listProcesses }: {
    force?: boolean;
    platform?: NodeJS.Platform;
    run?: RunSync;
    processes?: ListProcesses;
  } = {},
): void {
  if (platform === "win32" && proc.pid) {
    const result = run("taskkill", ["/T", "/F", "/PID", String(proc.pid)]);
    if (!result.error && result.status === 0) return;
  }
  if (force && platform !== "win32" && proc.pid) {
    // Listed first: once the bootloader is dead its child belongs to init and the link is lost.
    for (const pid of descendantsOf(proc.pid, processes()).reverse()) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }
  try {
    proc.kill(force ? "SIGKILL" : undefined);
  } catch {
    // Already gone.
  }
}
