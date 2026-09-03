/**
 * Waiting for a library job to finish (LIBRARY-11).
 *
 * The page starts jobs and needs to know when they end; it does **not** draw
 * progress. SHELL-07's status strip already reports every running job, and a
 * second progress display on this page would be a second thing to keep in step
 * with the job payload for no gain.
 *
 * Prefers the SSE subscription the bridge exposes and falls back to polling —
 * the same order `useMatchJob` uses, for the same reason: the subscription
 * pushes on change and ends by itself, while polling is what a browser-lab
 * render or an older preload can still manage.
 */
import type { EngineJobSummary, JobState } from "../../api/cuepointBridge.types";

/** How often to ask, when there is no subscription to listen to. */
export const POLL_INTERVAL_MS = 400;

const TERMINAL: readonly JobState[] = ["succeeded", "failed", "cancelled"];

export function isTerminal(state: string | undefined): boolean {
  return TERMINAL.includes(state as JobState);
}

export interface FinishedJob {
  state: JobState;
  error?: { code?: string; message?: string };
}

export interface FollowHandle {
  /** Resolves once the job reaches a terminal state. Never rejects. */
  finished: Promise<FinishedJob>;
  /**
   * Stop listening. The promise is left unresolved on purpose: the caller
   * cancels because it has gone away, and resolving would run a completion
   * handler for a screen that is no longer there.
   */
  stop: () => void;
}

/**
 * Follow a job to its end.
 *
 * Never rejects. A bridge that is missing, an unreadable status, a job the
 * engine has forgotten — all of them resolve as a failed job with a message,
 * because a promise that rejects here would surface as an unhandled error in a
 * screen whose whole job is to explain what happened.
 */
export function followJob(jobId: string, pollMs = POLL_INTERVAL_MS): FollowHandle {
  let settle: ((value: FinishedJob) => void) | null = null;
  let unsubscribe: (() => void) | null = null;
  let timer: number | null = null;
  let stopped = false;

  const finished = new Promise<FinishedJob>((resolve) => {
    settle = resolve;
  });

  const cleanup = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const finish = (value: FinishedJob) => {
    if (stopped) return;
    stopped = true;
    cleanup();
    settle?.(value);
  };

  const consider = (status: Partial<EngineJobSummary> | null | undefined) => {
    if (!status || !isTerminal(status.state)) return;
    finish({ state: status.state as JobState, error: status.error });
  };

  const bridge = window.cuepoint;
  if (!bridge?.getJob) {
    finish({
      state: "failed",
      error: { code: "NO_BRIDGE", message: "The engine is not connected." },
    });
    return { finished, stop: () => finish({ state: "cancelled" }) };
  }

  const check = async () => {
    try {
      consider(await bridge.getJob!(jobId));
    } catch (error) {
      finish({
        state: "failed",
        error: {
          message: error instanceof Error ? error.message : "Lost track of the job.",
        },
      });
    }
  };

  if (bridge.subscribeJobEvents) {
    unsubscribe = bridge.subscribeJobEvents(jobId, (event) => {
      consider(event as Partial<EngineJobSummary>);
    });
  } else {
    timer = window.setInterval(() => void check(), pollMs);
  }

  // Asked once immediately either way. A job short enough to finish before the
  // subscription attaches would otherwise never report at all — which is not
  // hypothetical: an apply against an unchanged export takes milliseconds.
  void check();

  return {
    finished,
    stop: () => {
      stopped = true;
      cleanup();
    },
  };
}
