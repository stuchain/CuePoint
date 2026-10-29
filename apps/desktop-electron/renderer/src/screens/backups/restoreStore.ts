/**
 * A restore in progress, kept above every page (HARDEN-01).
 *
 * Settings is a kept page: while another page is shown its effects do not run, so a restore that
 * waits for work to end, or an answer that arrives while it is hidden, would be lost there. This
 * module state outlives the page: the wait, main's progress events and the result all land here, and
 * Settings, the status strip and the recovery screen read it.
 *
 * Every view reads the library again once per restore, however many ways there are to learn it ended.
 */
import { refreshEngineStatus } from "../../api/engineOnline";
import type { BackupEntry, BackupRestoreEvent, BackupRestoreResult } from "../../api/cuepointBridge.types";
import { reloadEveryView } from "../../api/reloadEveryView";
import { userMessage } from "../../api/userMessage";
import { workThe } from "./backupWords";

const WAIT_POLL_MS = 2000;

export interface RestoreSnapshot {
  /** Main has stopped CuePoint's work, or a restore call is out. */
  restoring: boolean;
  /** "Restore when done" was chosen: the restore waits for this work to end. */
  waiting: { entry: BackupEntry; line: string } | null;
  /** Why the last restore did not happen, in words. */
  error: string | null;
}

const IDLE: RestoreSnapshot = { restoring: false, waiting: null, error: null };

let snapshot: RestoreSnapshot = IDLE;
let wired: (() => void) | null = null;
let reloaded = true;
let seen = false;
let finishedAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
const listeners = new Set<() => void>();
const settledListeners = new Set<(outcome: "restored" | "failed") => void>();

function set(next: Partial<RestoreSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of [...listeners]) listener();
}

export function getRestoreSnapshot(): RestoreSnapshot {
  return snapshot;
}

export function subscribeRestore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called when a restore has ended, whichever way it did; for the app to read the library's state again. */
export function onRestoreSettled(listener: (outcome: "restored" | "failed") => void): () => void {
  settledListeners.add(listener);
  return () => {
    settledListeners.delete(listener);
  };
}

/** True once a restore has been seen this session (it is the reason an interrupted export may be gone). */
export function restoreSeen(): boolean {
  return seen;
}

function settle(outcome: "restored" | "failed"): void {
  for (const listener of [...settledListeners]) listener(outcome);
}

function finish(): void {
  if (reloaded) return;
  reloaded = true;
  finishedAt = Date.now();
  set({ restoring: false, waiting: null });
  reloadEveryView();
  settle("restored");
}

function fail(message: string): void {
  reloaded = true;
  set({ restoring: false, error: message });
  refreshEngineStatus();
  settle("failed");
}

/** Listen to main's restore events, once. Safe to call from anywhere, any number of times. */
export function ensureRestoreWired(): void {
  if (wired) return;
  const off = window.cuepoint?.backups?.onRestoreEvent((event: BackupRestoreEvent) => {
    seen = true;
    if (event.phase === "restored") {
      // An unasked restore (another window, a wait that ended) still needs one reload; a repeat of one just done does not.
      if (reloaded && Date.now() - finishedAt > 3000) reloaded = false;
      finish();
    }
    else if (event.phase === "failed") fail(event.message);
    else {
      reloaded = false;
      set({ restoring: true });
    }
  });
  if (off) wired = off;
}

/** Ask main to restore. Answers the result so a caller can ask about running work; other failures are said here. */
export async function runRestore(entry: BackupEntry, cancelRunning: boolean): Promise<BackupRestoreResult | null> {
  const api = window.cuepoint?.backups;
  if (!api) return null;
  ensureRestoreWired();
  set({ error: null });
  seen = true;
  reloaded = false;
  try {
    const result = await api.restore(entry.name, cancelRunning ? { cancelRunning: true } : undefined);
    if (result.ok) finish();
    else if (result.errorCode === "WORK_RUNNING") reloaded = true;
    else fail(result.message);
    return result;
  } catch (cause) {
    fail(userMessage(cause, "Your library was not changed."));
    return null;
  }
}

async function tick(): Promise<void> {
  const target = snapshot.waiting?.entry;
  if (ticking || !target) return;
  ticking = true;
  try {
    const list = window.cuepoint?.listJobs;
    const active = list ? (await list({ state: "active", limit: 1 })).active_count : 0;
    if (snapshot.waiting?.entry !== target || active > 0) return;
    // Nothing is running now. If more work started meanwhile, main says so and the wait goes on.
    const result = await runRestore(target, false);
    if (result && !result.ok && result.errorCode === "WORK_RUNNING") return;
    if (snapshot.waiting?.entry === target) set({ waiting: null });
    stopTimer();
  } catch {
    // Not read this time; the next tick asks again.
  } finally {
    ticking = false;
  }
}

function stopTimer(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

/** "Restore when done": wait for the running work to end, then restore. `work` is the noun ("An import"). */
export function waitThenRestore(entry: BackupEntry, work: string): void {
  ensureRestoreWired();
  set({ error: null, waiting: { entry, line: `Restores your library when ${workThe(work)} finishes` } });
  if (timer === null) timer = setInterval(() => void tick(), WAIT_POLL_MS);
}

export function stopWaiting(): void {
  stopTimer();
  if (snapshot.waiting) set({ waiting: null });
}

export function clearRestoreError(): void {
  if (snapshot.error !== null) set({ error: null });
}

/** Back to the start; for tests. */
export function resetRestoreForTests(): void {
  stopTimer();
  wired?.();
  wired = null;
  reloaded = true;
  seen = false;
  finishedAt = 0;
  ticking = false;
  snapshot = IDLE;
  listeners.clear();
  settledListeners.clear();
}
