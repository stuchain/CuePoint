/**
 * The one shared read of the waveform analysis (WAVE-03).
 *
 * Every `useWaveformAnalysis` consumer shows the same state, so there is one
 * poller for all of them, not one each: a Set with thirty transitions mounts
 * thirty hooks, and thirty reads every two seconds ran the engine's status
 * count thirty times over. Here:
 *
 * - a read is only started when none is on its way, and the next one is
 *   scheduled after the last settles, so reads never pile up behind a slow
 *   engine;
 * - it reads while at least one subscriber is on a visible page, and stops
 *   when the last leaves (hooks on a hidden kept page do not subscribe);
 * - the state is shared by every view and deliberately outlives them: it
 *   stays between mounts, so a view that mounts later shows the last state at
 *   once instead of blank, and the next read replaces it;
 * - an answer from Pause, Resume or Delete replaces the state for everyone,
 *   and a read that began before such an answer is dropped as older.
 */
import type { WaveformAnalysisStatus, WaveformAnswer } from "../../api/cuepointBridge.types";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";

export interface AnalysisSnapshot {
  /** The last state read, or null before the first read. */
  status: WaveformAnalysisStatus | null;
  /** Why the state could not be read, or null. */
  error: string | null;
}

let snapshot: AnalysisSnapshot = { status: null, error: null };
const listeners = new Set<() => void>();
/** Pollers by the interval each asked for; the shortest wins. */
const pollers = new Map<symbol, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
/** Bumped by every answer taken from an action, so an older read is dropped. */
let version = 0;
/** Bumped by a reset, so a read pending across it neither publishes nor schedules. */
let generation = 0;

function publish(next: AnalysisSnapshot): void {
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

export function getAnalysisSnapshot(): AnalysisSnapshot {
  return snapshot;
}

export function subscribeAnalysis(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A state an action answered: replaces the last read, for every consumer. */
export function takeAnalysisStatus(status: WaveformAnalysisStatus): void {
  version += 1;
  publish({ status, error: null });
}

/** Say why an action failed, for every consumer. */
export function failAnalysis(message: string): void {
  publish({ ...snapshot, error: message });
}

function interval(): number {
  return Math.min(...pollers.values());
}

function schedule(): void {
  if (timer !== null || inFlight || pollers.size === 0) return;
  timer = setTimeout(() => {
    timer = null;
    void read();
  }, interval());
}

async function read(): Promise<void> {
  if (inFlight || pollers.size === 0) return;
  const call = window.cuepoint?.waveforms?.analysis;
  if (!call) return;
  inFlight = true;
  const started = version;
  const born = generation;
  try {
    const answer: WaveformAnswer<WaveformAnalysisStatus> = await call();
    if (born === generation && started === version) {
      publish(
        answer.refusal
          ? { ...snapshot, error: answer.refusal.message }
          : { status: answer.value, error: null },
      );
    }
  } catch (cause) {
    reportUnexpected(cause);
    if (born === generation && started === version) {
      publish({ ...snapshot, error: userMessage(cause) });
    }
  } finally {
    if (born === generation) {
      inFlight = false;
      schedule();
    }
  }
}

/**
 * Follow the analysis until the returned function is called. The first
 * follower reads at once; later ones join the poll already running.
 */
export function followAnalysis(pollMs: number): () => void {
  const id = Symbol("analysis-follower");
  const first = pollers.size === 0;
  pollers.set(id, pollMs);
  if (first && !inFlight) void read();
  return () => {
    pollers.delete(id);
    if (pollers.size === 0 && timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/** Forget everything; for tests, which share this module. */
export function resetAnalysisStore(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  inFlight = false;
  generation += 1;
  pollers.clear();
  snapshot = { status: null, error: null };
  listeners.clear();
}
