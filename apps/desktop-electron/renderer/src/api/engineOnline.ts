/**
 * One online/offline state for the window (banner step).
 *
 * The status strip, the banner above the page and the dimming of the page used
 * to be three opinions: the strip polled on its own, pages kept stale rows, and
 * every button failed one at a time. They now read this single store, which owns
 * the poll that `useEngineStatus` used to run.
 *
 * "Offline" means the background process is not there: the latest status is not
 * connected and it is not merely starting (starting ends by itself), or a call
 * failed with an outage (`noteOutage`) and no poll has succeeded since. A failure
 * that is not an outage never reaches here: `userMessage` only notes what
 * `isOutage` accepts, and a 5xx is not one.
 */
import { useSyncExternalStore } from "react";
import type { EngineStatus } from "./cuepointBridge.types";

/**
 * How often the status is re-read.
 *
 * `getStatus()` on the supervisor is an in-memory check, not an HTTP call, so
 * this is close to free; it is modest because the strip is mounted for the life
 * of the app and a permanent poll is permanent load.
 */
const POLL_MS = 4000;

export interface EngineOnline {
  /** The latest status; null until the first read, or with no bridge at all. */
  status: EngineStatus | null;
  /** True when the background process is not there. */
  offline: boolean;
  /**
   * When it was last seen connected (epoch ms), or null if never. Taken at the moment it goes
   * offline, not at every poll, so nothing re-renders just because a poll found it still up.
   */
  lastOkAt: number | null;
}

let status: EngineStatus | null = null;
/** When a poll last found it connected; recorded every poll, published when it matters. */
let okAt: number | null = null;
/** A status other than connected or a first launch's starting has been seen since it was last up. */
let sawStop = false;
/** A failed call said the process is gone; cleared by the next connected poll. */
let outage = false;
/** Counts `noteOutage` calls, so a poll that began earlier cannot clear a later one. */
let outageSeq = 0;
/** Counts pushes from main, so a poll that began before one is followed by another. */
let pushSeq = 0;
/** Bumped by a reset, so a read that began before it cannot write into the new store. */
let generation = 0;
let inflight: Promise<void> | null = null;
/** The read in flight was asked for by an outage, so it already answers later ones. */
let inflightForOutage = false;
let timer: ReturnType<typeof setInterval> | null = null;
let unlisten: (() => void) | null = null;
const listeners = new Set<() => void>();
let snapshot: EngineOnline = { status: null, offline: false, lastOkAt: null };

function hasBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.cuepoint?.getEngineStatus);
}

/** The same fields: a poll that finds nothing new keeps the object it had. */
function sameStatus(a: EngineStatus | null, b: EngineStatus | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.connected === b.connected &&
    a.version === b.version &&
    a.sessionId === b.sessionId &&
    a.error === b.error &&
    a.reconnecting === b.reconnecting &&
    a.restartAttempts === b.restartAttempts &&
    a.starting === b.starting
  );
}

/**
 * Only the first launch's "starting" is online: it ends by itself and nothing was lost. Every
 * later one (an automatic restart, the person's own, or one after the attempts gave up) is the
 * background process coming back, and the page is still stopped until it is.
 */
function isOffline(): boolean {
  if (!hasBridge()) return false;
  if (outage) return true;
  if (status === null || status.connected) return false;
  if (!status.starting) return true;
  return status.reconnecting === true || okAt !== null || sawStop;
}

function publish(): void {
  const offline = isOffline();
  const nextStatus = sameStatus(snapshot.status, status) ? snapshot.status : status;
  const lastOkAt = offline !== snapshot.offline || snapshot.lastOkAt === null ? okAt : snapshot.lastOkAt;
  if (snapshot.status === nextStatus && snapshot.offline === offline && snapshot.lastOkAt === lastOkAt) return;
  snapshot = { status: nextStatus, offline, lastOkAt };
  for (const listener of [...listeners]) listener();
}

function poll(): Promise<void> {
  if (inflight) return inflight;
  const read = typeof window === "undefined" ? undefined : window.cuepoint?.getEngineStatus;
  if (!read) {
    // No bridge: the renderer runs in a browser tab during development.
    status = null;
    outage = false;
    publish();
    return Promise.resolve();
  }
  const mine = generation;
  const seq = outageSeq;
  const pushed = pushSeq;
  inflightForOutage = false;
  const settle = (next: EngineStatus) => {
    if (mine !== generation) return;
    status = next;
    if (next.connected) {
      okAt = Date.now();
      sawStop = false;
      if (seq === outageSeq) outage = false;
    } else if (!next.starting) {
      sawStop = true;
    }
    publish();
  };
  const run: Promise<void> = read()
    .then(settle)
    // A failed status read *is* a status: the background process is not reachable.
    .catch(() => settle({ connected: false, error: "Background process unreachable" }))
    .finally(() => {
      if (mine !== generation) return;
      inflight = null;
      // A failure or a push while this read was in flight is not answered by it.
      if ((seq !== outageSeq && outage) || pushed !== pushSeq) void poll();
    });
  inflight = run;
  return run;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    void poll();
    // The poll is the backstop: main pushes a change the moment the supervisor knows of it.
    timer = setInterval(() => void poll(), POLL_MS);
    if (typeof window !== "undefined") {
      unlisten =
        window.cuepoint?.onEngineStatusChanged?.(() => {
          pushSeq += 1;
          void poll();
        }) ?? null;
    }
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer !== null) clearInterval(timer);
      timer = null;
      unlisten?.();
      unlisten = null;
    }
  };
}

export function getSnapshot(): EngineOnline {
  return snapshot;
}

/**
 * A call just failed because the background process is gone: go offline now and
 * check at once, rather than waiting up to 4 s for the poll. Many failures in a
 * row (a page of buttons) share one read. Without a bridge there is nothing to
 * be offline from, so it does nothing.
 */
export function noteOutage(): void {
  if (!hasBridge()) return;
  outage = true;
  publish();
  if (!inflight) {
    outageSeq += 1;
    void poll();
    inflightForOutage = true;
  } else if (!inflightForOutage) {
    // A read already under way began before this failure and cannot clear it.
    outageSeq += 1;
  }
}

/** Read the status now, sharing a read already under way. */
export function refreshEngineStatus(): void {
  void poll();
}

/** Back to the state before the first read. For tests. */
export function resetEngineOnlineForTests(): void {
  generation += 1;
  status = null;
  okAt = null;
  sawStop = false;
  outage = false;
  outageSeq = 0;
  pushSeq = 0;
  inflight = null;
  inflightForOutage = false;
  snapshot = { status: null, offline: false, lastOkAt: null };
  if (timer !== null) clearInterval(timer);
  timer = null;
  unlisten?.();
  unlisten = null;
  listeners.clear();
}

/** The shared state, live. */
export function useEngineOnline(): EngineOnline {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Only whether it is offline: the whole app reads this, and it changes rarely. */
export function useEngineOffline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot().offline,
    () => false,
  );
}
