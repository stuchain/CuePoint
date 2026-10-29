/**
 * Backups from the app's side (HARDEN-01b): list, back up now, show the folder, and restore.
 *
 * A restore runs here, in main, with the engine stopped, so nothing holds the library file:
 *
 *   1. if work is running, refuse (`WORK_RUNNING`) unless the caller says to cancel it; cancelling
 *      goes through each job's own cancel and waits for the work to finish, never a kill;
 *   2. stop the engine through the supervisor's maintenance stop (nothing counted as a crash);
 *   3. run the engine once with `--restore <name>` (same launch and environment as the engine);
 *   4. start the engine again, ALWAYS, also when the restore failed or could not be run;
 *   5. tell the window, so every view reloads.
 *
 * Everything the person may read says "library" and "backup" (DEC-155, DEC-158). Asking first
 * while work runs (DEC-173) is the page's job; this answers with what it needs.
 */
import type { BackupEntry, BackupList } from "./engineClient";
import type { EngineJobList } from "./engineClient";
import type { EngineRunResult, EngineStatus } from "./engineSupervisor";

/** How long the restore may run: a large library is copied, checked and swapped. */
export const RESTORE_TIMEOUT_MS = 10 * 60_000;
/** How long cancelled work gets to finish before the restore gives up on stopping it. */
export const CANCEL_WAIT_MS = 60_000;
const CANCEL_POLL_MS = 500;

export interface RunningWork {
  id: string;
  type: string;
  state: string;
}

export type RestoreResult =
  | {
      ok: true;
      /** The backup kept of the library as it was before the restore. */
      safetyBackup?: string;
      /** False when the library was restored but CuePoint's work did not come back up. */
      engineRunning: boolean;
    }
  | {
      ok: false;
      errorCode: string;
      message: string;
      /** Set with `WORK_RUNNING`: what is running. */
      running?: RunningWork[];
    };

/** What the window is told as a restore goes on; `restored` is the cue to reload every view. */
export type RestoreEvent =
  | { phase: "stopping" | "restoring" | "starting" }
  | { phase: "restored"; safetyBackup?: string }
  | { phase: "failed"; errorCode: string; message: string };

/** The parts of the supervisor, main and Electron this needs; faked in the tests. */
export interface BackupsDeps {
  engine: {
    getStatus(): EngineStatus;
    listBackups(): Promise<BackupList>;
    createBackup(): Promise<BackupEntry>;
    listJobs(params: { state: "active"; limit: number }): Promise<EngineJobList>;
    cancelJob(jobId: string): Promise<unknown>;
    /** Stops the engine; the token it returns is what lets `start` bring it back. */
    stopForMaintenance(): Promise<unknown>;
    runOnce(args: readonly string[], timeoutMs: number): Promise<EngineRunResult>;
    start(token?: unknown): Promise<EngineStatus>;
  };
  shell: {
    openPath(target: string): Promise<string>;
    showItemInFolder(target: string): void;
  };
  /** Joins a folder and a file name; `path.join` in main. */
  join(folder: string, name: string): string;
  /** Tells the window; never throws into the restore. */
  notify(event: RestoreEvent): void;
  sleep?(ms: number): Promise<void>;
  restoreTimeoutMs?: number;
  cancelWaitMs?: number;
}

export interface RestoreOptions {
  /** Cancel running work (through its own cancel) and wait for it, instead of refusing. */
  cancelRunning?: boolean;
}

const FAILED_UNCHANGED = "Your library was not changed.";

/** A backup name from the page: one file name, never a path. */
export function validBackupName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    !/[\\/\0]/.test(value) &&
    value !== "." &&
    value !== ".." &&
    !value.startsWith(".")
  );
}

/** The last line of `text` that is a JSON object, or null. */
function lastJsonLine(text: string): Record<string, unknown> | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().startsWith("{"));
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed: unknown = JSON.parse(lines[i]!);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* not JSON: an earlier line may be */
    }
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export class Backups {
  private restoring = false;
  private quitting = false;
  private idle: Promise<void> = Promise.resolve();
  private settle: () => void = () => undefined;

  constructor(private readonly deps: BackupsDeps) {}

  /**
   * The app is quitting: no restore begins, and a restore under way does not start the engine
   * again. The restore itself is never cut short (it may be mid-swap); the quit waits for it.
   */
  beginQuit(): void {
    this.quitting = true;
  }

  /** Resolves when no restore is going on. */
  settled(): Promise<void> {
    return this.restoring ? this.idle : Promise.resolve();
  }

  /** True while a restore is going on. */
  isRestoring(): boolean {
    return this.restoring;
  }

  listBackups(): Promise<BackupList> {
    return this.deps.engine.listBackups();
  }

  createBackup(): Promise<BackupEntry> {
    if (this.restoring) return Promise.reject(new Error("Your library is being restored. Try again in a moment."));
    return this.deps.engine.createBackup();
  }

  /**
   * Show the backups folder, or, given a name, that backup in it. Returns false when the folder
   * is not known (CuePoint's work is not running and so cannot say).
   */
  async showInFolder(name?: string): Promise<boolean> {
    if (name !== undefined && !validBackupName(name)) return false;
    let folder: string | null;
    try {
      folder = (await this.deps.engine.listBackups()).folder;
    } catch {
      return false;
    }
    if (!folder) return false;
    if (name !== undefined) {
      this.deps.shell.showItemInFolder(this.deps.join(folder, name));
      return true;
    }
    // A folder that does not exist yet (no backup made) cannot be opened: show where it will be.
    const failure = await this.deps.shell.openPath(folder);
    if (failure) this.deps.shell.showItemInFolder(folder);
    return true;
  }

  private notify(event: RestoreEvent): void {
    try {
      this.deps.notify(event);
    } catch {
      /* a window that is gone must not end the restore */
    }
  }

  private async runningWork(): Promise<RunningWork[]> {
    // An engine that is not up has no work, and is what a restore is for.
    if (!this.deps.engine.getStatus().connected) return [];
    const list = await this.deps.engine.listJobs({ state: "active", limit: 50 });
    return list.jobs
      .filter((job) => job.state === "running" || job.state === "queued")
      .map((job) => ({ id: job.id, type: job.type, state: job.state }));
  }

  /** Cancel each job through its own cancel, then wait until none is active. */
  private async cancelAndWait(first: RunningWork[]): Promise<boolean> {
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const deadline = (this.deps.cancelWaitMs ?? CANCEL_WAIT_MS) / CANCEL_POLL_MS;
    let work = first;
    for (let attempt = 0; attempt <= deadline; attempt++) {
      // Asked again each round: work that was queued behind the cancelled job starts, and is asked too.
      for (const job of work) {
        try {
          await this.deps.engine.cancelJob(job.id);
        } catch {
          /* already finished, or gone: the wait below settles it */
        }
      }
      await sleep(CANCEL_POLL_MS);
      try {
        work = await this.runningWork();
      } catch {
        return false;
      }
      if (work.length === 0) return true;
    }
    return false;
  }

  async restore(name: unknown, options: RestoreOptions = {}): Promise<RestoreResult> {
    if (!validBackupName(name)) {
      return { ok: false, errorCode: "BACKUP_INVALID_NAME", message: "That backup could not be found." };
    }
    if (this.restoring) {
      return {
        ok: false,
        errorCode: "RESTORE_IN_PROGRESS",
        message: "Your library is already being restored.",
      };
    }
    if (this.quitting) {
      return { ok: false, errorCode: "APP_QUITTING", message: "CuePoint is closing. Your library was not changed." };
    }
    this.restoring = true;
    this.idle = new Promise<void>((resolve) => (this.settle = resolve));
    try {
      let running: RunningWork[];
      try {
        running = await this.runningWork();
      } catch {
        return {
          ok: false,
          errorCode: "WORK_UNKNOWN",
          message: "CuePoint could not tell whether it is busy, so your library was not restored.",
        };
      }
      if (running.length > 0) {
        if (!options.cancelRunning) {
          return {
            ok: false,
            errorCode: "WORK_RUNNING",
            message: "CuePoint is busy. Your library was not changed.",
            running,
          };
        }
        if (!(await this.cancelAndWait(running))) {
          return {
            ok: false,
            errorCode: "WORK_NOT_STOPPED",
            message: "CuePoint's work did not stop in time. Your library was not changed.",
          };
        }
      }
      // Work may have started while the cancelled work wound down: look once more, right before.
      try {
        running = await this.runningWork();
      } catch {
        running = [{ id: "", type: "unknown", state: "unknown" }];
      }
      if (running.length > 0) {
        return {
          ok: false,
          errorCode: "WORK_RUNNING",
          message: "CuePoint is busy. Your library was not changed.",
          running: running.filter((job) => job.id !== ""),
        };
      }
      return await this.stopRestoreStart(name);
    } finally {
      this.restoring = false;
      this.settle();
    }
  }

  /** Steps 2 to 5: the engine is started again whatever happens before it. */
  private async stopRestoreStart(name: string): Promise<RestoreResult> {
    let outcome: RestoreResult;
    let token: unknown;
    this.notify({ phase: "stopping" });
    try {
      token = await this.deps.engine.stopForMaintenance();
      this.notify({ phase: "restoring" });
      outcome = this.outcomeOf(
        await this.deps.engine.runOnce(["--restore", name], this.deps.restoreTimeoutMs ?? RESTORE_TIMEOUT_MS),
      );
    } catch {
      outcome = {
        ok: false,
        errorCode: "RESTORE_FAILED",
        message: `Your library could not be restored. ${FAILED_UNCHANGED}`,
      };
    }

    let engineRunning = false;
    // A quit that began meanwhile is stopping the engine for good: not started again behind it.
    if (!this.quitting) {
      this.notify({ phase: "starting" });
      try {
        engineRunning = (await this.deps.engine.start(token)).connected;
      } catch {
        engineRunning = false;
      }
    }

    if (outcome.ok) {
      outcome = { ...outcome, engineRunning };
      this.notify({ phase: "restored", safetyBackup: outcome.safetyBackup });
    } else {
      this.notify({ phase: "failed", errorCode: outcome.errorCode, message: outcome.message });
    }
    return outcome;
  }

  private outcomeOf(run: EngineRunResult): RestoreResult {
    if (run.spawnError) {
      return {
        ok: false,
        errorCode: "RESTORE_FAILED",
        message: `The backup could not be restored. ${FAILED_UNCHANGED}`,
      };
    }
    if (run.timedOut) {
      return {
        ok: false,
        errorCode: "RESTORE_TIMED_OUT",
        message:
          "Restoring took too long and was stopped. CuePoint checked your library when it opened again; " +
          "if anything looks wrong, restore a backup again.",
      };
    }
    if (run.code === 0) {
      const said = lastJsonLine(run.stdout);
      const safety = text(said?.safety_backup);
      return safety ? { ok: true, safetyBackup: safety, engineRunning: false } : { ok: true, engineRunning: false };
    }
    const failure = lastJsonLine(run.stderr);
    const code = text(failure?.error_code);
    // Only a failure the restore itself reported is known to have left the library as it was; a
    // crash or a signal is not, so CuePoint says it checks.
    if (!code) {
      return {
        ok: false,
        errorCode: "RESTORE_FAILED",
        message:
          "The backup could not be restored. CuePoint checked your library when it opened again; " +
          "if anything looks wrong, restore a backup again.",
      };
    }
    const words = text(failure?.message) ?? "The backup could not be restored.";
    return { ok: false, errorCode: code, message: `${words} ${FAILED_UNCHANGED}` };
  }
}
