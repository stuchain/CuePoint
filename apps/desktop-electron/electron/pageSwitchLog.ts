import type { FinishedCall } from "./engineCallTiming";
import type { MainLog } from "./mainLog";

/**
 * One log line for each page the user opens: how long the page took to draw (the renderer's
 * number), how long the engine then took to go quiet, and the slowest call in between. The
 * settle clock starts when main receives the message, not when the click happened.
 */

export const SETTLE_QUIET_MS = 150;
export const SETTLE_POLL_MS = 25;
export const SETTLE_CAP_MS = 15_000;
const SLOW_MS = 1000;
const PAGE = /^[a-z-]{1,20}$/;

export interface PageSwitchDeps {
  log: Pick<MainLog, "info" | "warn">;
  /** Milliseconds, any steady clock. */
  now: () => number;
  /** Wall clock, to match `FinishedCall.endedAt`. */
  wallNow?: () => number;
  inFlight: () => number;
  callsBetween: (startMs: number, endMs: number) => FinishedCall[];
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface PageSwitchLog {
  /** Returns false when the input was ignored. */
  report(page: unknown, drawMs: unknown): boolean;
}

export function createPageSwitchLog(deps: PageSwitchDeps): PageSwitchLog {
  const wallNow = deps.wallNow ?? ((): number => Date.now());
  const every = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const stop = deps.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  let current: { page: string; cancel: () => void } | null = null;

  const seconds = (ms: number): string => `${Math.round(ms)} ms`;

  return {
    report(page, drawMs) {
      if (typeof page !== "string" || !PAGE.test(page)) return false;
      if (typeof drawMs !== "number" || !Number.isFinite(drawMs) || drawMs < 0 || drawMs > 600_000) return false;

      if (current !== null) current.cancel();

      const arrived = deps.now();
      const arrivedWall = wallNow();
      let quietSince: number | null = null;
      let handle: unknown = null;
      let done = false;

      const finish = (): void => {
        done = true;
        stop(handle);
        if (current !== null && current.page === page && current.cancel === cancel) current = null;
      };
      const cancel = (): void => {
        if (done) return;
        finish();
        deps.log.info("page", `${page} left before settling`, { drawn: String(Math.round(drawMs)) });
      };
      current = { page, cancel };

      const tick = (): void => {
        if (done) return;
        const t = deps.now();
        const elapsed = t - arrived;
        if (deps.inFlight() === 0) {
          if (quietSince === null) quietSince = t;
        } else {
          quietSince = null;
        }
        const quiet = quietSince !== null && t - quietSince >= SETTLE_QUIET_MS;
        const capped = elapsed >= SETTLE_CAP_MS;
        if (!quiet && !capped) return;
        finish();
        // The settle time is the moment it went quiet, not the moment the quiet was confirmed.
        const settled = capped && !quiet ? elapsed : (quietSince as number) - arrived;
        // From when the page started drawing: its first reads begin in its mount effects, before
        // the renderer reports the switch.
        const calls = deps.callsBetween(arrivedWall - drawMs, wallNow());
        let slowest: FinishedCall | null = null;
        for (const call of calls) if (slowest === null || call.ms > slowest.ms) slowest = call;
        let message = `${page} drawn ${seconds(drawMs)}, settled ${seconds(settled)}${capped && !quiet ? " (gave up waiting)" : ""}, ${calls.length} calls`;
        if (slowest !== null) message += `, slowest ${slowest.method} ${slowest.route} ${seconds(slowest.ms)}`;
        const slow = drawMs > SLOW_MS || settled > SLOW_MS;
        (slow ? deps.log.warn : deps.log.info)("page", message);
      };

      handle = every(tick, SETTLE_POLL_MS);
      return true;
    },
  };
}
