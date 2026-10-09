/**
 * Restarting to install an update while work runs (DEC-173, DIST-07).
 *
 * Restarting stops whatever CuePoint is doing, so when something is running the person is asked:
 * restart when it is done, restart now, or cancel. This is one store for the whole page, so the
 * status strip's panel and Settings agree, the choice survives either one coming and going, there
 * is a single watcher, and the restart is asked of main once.
 *
 * It watches running work only while a question is open or a restart is waiting; an update that
 * is merely ready costs no polling.
 *
 * "Restart when done" waits for the work that was running when it was chosen, and restarts when
 * those are gone. Work that starts afterwards (the file check that follows an import) is not waited for.
 */
import { jobLabel } from "../shell/useActiveJob";

export interface RestartSnapshot {
  phase: "idle" | "confirming" | "waiting";
  /** The work in a few words ("Importing"); null when nothing is known. */
  work: string | null;
  /** CuePoint could not tell what is running, so it asks rather than restart. */
  unknown: boolean;
}

const IDLE: RestartSnapshot = { phase: "idle", work: null, unknown: false };
const POLL_MS = 2000;

let snapshot: RestartSnapshot = IDLE;
let waitingFor = new Set<string>();
let knownIds: string[] = [];
let fired = false;
let asking = false;
let ticking = false;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

interface ActiveWork {
  ids: string[];
  count: number;
  complete: boolean;
  work: string | null;
}

export function getRestartSnapshot(): RestartSnapshot {
  return snapshot;
}

export function subscribeRestart(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function set(next: RestartSnapshot) {
  snapshot = next;
  if (next.phase === "idle") stopPolling();
  else startPolling();
  for (const listener of [...listeners]) listener();
}

/** "Importing" from "Importing · 3 of 10"; background work in general when several run or it has not started. */
function nameOf(jobs: Parameters<typeof jobLabel>[0][], count: number): string {
  const only = jobs[0];
  if (count !== 1 || !only || only.state !== "running") return "Background work";
  return jobLabel(only).split(" · ")[0] ?? "Background work";
}

async function readWork(): Promise<ActiveWork | null> {
  const list = window.cuepoint?.listJobs;
  if (!list) return null;
  try {
    const result = await list({ state: "active", limit: 5 });
    return {
      ids: result.jobs.map((job) => job.id),
      count: result.active_count,
      complete: result.active_count <= result.jobs.length,
      work: nameOf(result.jobs, result.active_count),
    };
  } catch {
    return null;
  }
}

async function tick() {
  if (ticking || snapshot.phase === "idle") return;
  ticking = true;
  try {
    const work = await readWork();
    if (!work) return;
    if (snapshot.phase === "waiting") {
      const stillRunning = work.ids.some((id) => waitingFor.has(id));
      if (!stillRunning && work.complete) restartNow();
    } else if (snapshot.phase === "confirming") {
      if (work.count === 0) {
        set(IDLE);
      } else {
        knownIds = work.ids;
        set({ phase: "confirming", work: work.work, unknown: false });
      }
    }
  } finally {
    ticking = false;
  }
}

function startPolling() {
  if (timer === null) timer = setInterval(() => void tick(), POLL_MS);
}

function stopPolling() {
  if (timer !== null) clearInterval(timer);
  timer = null;
}

/** Restart now, or ask first when work is running, or when it cannot be told. */
export async function requestRestart(): Promise<void> {
  if (fired || asking || snapshot.phase !== "idle") return;
  asking = true;
  try {
    const work = await readWork();
    if (work && work.count === 0) {
      restartNow();
      return;
    }
    knownIds = work?.ids ?? [];
    set({ phase: "confirming", work: work?.work ?? null, unknown: work === null });
  } finally {
    asking = false;
  }
}

/** Restart at once, whatever is running. Asks main once. */
export function restartNow(): void {
  if (fired) return;
  fired = true;
  waitingFor = new Set();
  set(IDLE);
  void Promise.resolve(window.cuepoint?.updates?.restart?.())
    .catch(() => false)
    .then((started) => {
      // Not started (the state moved on): the person can ask again.
      if (!started) fired = false;
    });
}

/** Wait for the work that is running now to end, then restart. */
export function restartWhenDone(): void {
  if (snapshot.phase !== "confirming" || snapshot.unknown) return;
  if (knownIds.length === 0) {
    restartNow();
    return;
  }
  waitingFor = new Set(knownIds);
  set({ phase: "waiting", work: snapshot.work, unknown: false });
}

/** Leave the question without restarting. */
export function cancelRestart(): void {
  if (snapshot.phase === "confirming") set(IDLE);
}

/** Stop waiting. */
export function stopWaiting(): void {
  if (snapshot.phase === "waiting") {
    waitingFor = new Set();
    set(IDLE);
  }
}

/** Back to the start; for tests. */
export function resetRestart(): void {
  fired = false;
  asking = false;
  ticking = false;
  waitingFor = new Set();
  knownIds = [];
  set(IDLE);
}

/** "Restarts when importing finishes": only the first letter is lowercased, so names keep their capitals. */
export function whenWorkEnds(work: string | null): string {
  if (work === null || work === "") return "Restarts when CuePoint's current work finishes";
  return `Restarts when ${work.charAt(0).toLowerCase()}${work.slice(1)} finishes`;
}
