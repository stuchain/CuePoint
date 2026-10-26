/**
 * Waiting for a library job to finish (LIBRARY-11).
 *
 * The page starts jobs and needs to know when they end; it does **not** draw
 * progress. SHELL-07's status strip already reports every running job, and a
 * second progress display on this page would be a second thing to keep in step
 * with the job payload for no gain.
 *
 * Prefers the SSE subscription the bridge exposes and falls back to polling:
 * the subscription pushes on change and ends by itself, while polling is what
 * a browser-lab render or an older preload can still manage.
 */
import type { EngineJobSummary, JobState } from "../../api/cuepointBridge.types";
import { pollActiveJobsNow, subscribeJobEvents } from "../../api/jobsStore";
import { reportUnexpected } from "../../reporting/reporting";
import { NEEDS_DESKTOP, isEngineOutage, userMessage } from "../../api/userMessage";

/** How often to ask, when there is no subscription to listen to. */
const POLL_INTERVAL_MS = 400;

/**
 * How often to ask anyway while listening to a stream. A stream can end
 * without the job's last frame (the engine closes it after five minutes, or
 * the connection drops), and a follower that only listens would then wait for
 * ever: a dig longer than that kept saying "A dig is already running."
 */
export const SAFETY_POLL_MS = 5_000;

const TERMINAL: readonly JobState[] = ["succeeded", "failed", "cancelled"];

export function isTerminal(state: string | undefined): boolean {
  return TERMINAL.includes(state as JobState);
}

export interface FinishedJob {
  state: JobState;
  error?: { code?: string; message?: string; report_id?: string | null };
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
  let safety: number | null = null;
  let stopped = false;
  // A job being followed has usually just been started: let the strip know now.
  pollActiveJobsNow();

  const finished = new Promise<FinishedJob>((resolve) => {
    settle = resolve;
  });

  const cleanup = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    if (safety !== null) {
      window.clearInterval(safety);
      safety = null;
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
      error: { code: "NO_BRIDGE", message: NEEDS_DESKTOP },
    });
    return { finished, stop: () => finish({ state: "cancelled" }) };
  }

  const check = async () => {
    try {
      consider(await bridge.getJob!(jobId));
    } catch (error) {
      reportUnexpected(error);
      // The job had started, so an outage here may have left some of it done.
      finish({
        state: "failed",
        error: {
          ...(isEngineOutage(error) ? { code: "UNAVAILABLE" } : {}),
          message: userMessage(error, "Lost track of that task.", { partway: true }),
        },
      });
    }
  };

  const poll = () => {
    if (stopped || timer !== null) return;
    timer = window.setInterval(() => void check(), pollMs);
  };

  if (typeof bridge.subscribeJobEvents === "function") {
    // Through the store, so the strip and this page share one stream for the job.
    unsubscribe = subscribeJobEvents(
      jobId,
      (event) => {
        const frame = event as Partial<EngineJobSummary> | null | undefined;
        // A frame with no state is the stream's own end (timed out, or failed)
        // before the job's: ask from here on instead.
        if (frame && frame.state == null) poll();
        else consider(frame);
      },
      bridge,
    );
    safety = window.setInterval(() => void check(), SAFETY_POLL_MS);
  } else {
    poll();
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
