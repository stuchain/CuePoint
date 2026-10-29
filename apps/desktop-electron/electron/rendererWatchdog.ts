/**
 * A window whose page stopped answering without the process exiting (HARDEN-05).
 *
 * `render-process-gone` covers a renderer that is gone. A renderer that is still there but
 * wedged (suspended, starved, or stuck while it dies, as a crashing process can be on a machine
 * that is slow to write its dump) never fires it: Electron says it is not crashed and not
 * loading, the window sits blank, and `unresponsive` only comes when the person clicks it. This
 * asks the page a trivial question on a timer, with the engine heartbeat's rules (`heartbeat.ts`),
 * and when it has not answered `maxMisses` times in a row ends the process. Its exit then goes
 * the way a crash goes: reload once, the recovery page on a second stop within a minute. Should
 * the exit never be reported, the stop is handed to the recovery itself after `graceMs`.
 *
 * What is done to a window is `main.ts`'s; this is the decision, with the clock and the actions
 * handed in, so it can be tested.
 */
import { Heartbeat } from "./heartbeat";

/** Often enough that a wedged window is replaced in about half a minute (3 x 4 s asking, 4 s each). */
export const RENDERER_PROBE_INTERVAL_MS = 4_000;
export const RENDERER_PROBE_TIMEOUT_MS = 4_000;
export const RENDERER_PROBE_MAX_MISSES = 3;
/** How long a killed renderer has to be reported gone before the stop is handed to the recovery. */
export const RENDERER_KILL_GRACE_MS = 5_000;

export interface RendererWatchdogDeps {
  /** Ask the page something trivial; resolves when it answers. */
  probe: () => Promise<unknown>;
  /**
   * Whether the page can be expected to answer now. Not while it loads, after it crashed (the crash
   * path has it), with the developer tools open (a paused debugger answers nothing), or when the app
   * is quitting: all count as an answer.
   */
  canProbe: () => boolean;
  /** End the renderer process. */
  kill: () => void;
  /** The stop, when the process did not report its own end in time. */
  stopped: (details: { reason: string }) => void;
  intervalMs?: number;
  timeoutMs?: number;
  maxMisses?: number;
  graceMs?: number;
}

export interface RendererWatchdog {
  start: () => void;
  stop: () => void;
  /** `render-process-gone` was seen: the process reported its own end. */
  noteGone: () => void;
}

export function createRendererWatchdog(deps: RendererWatchdogDeps): RendererWatchdog {
  let goneSeen = 0;
  let pending: NodeJS.Timeout | null = null;
  let heartbeat: Heartbeat | null = null;

  const clearPending = (): void => {
    if (pending) clearTimeout(pending);
    pending = null;
  };

  const make = (): Heartbeat =>
    new Heartbeat({
      probe: () => (deps.canProbe() ? deps.probe() : Promise.resolve(true)),
      intervalMs: deps.intervalMs ?? RENDERER_PROBE_INTERVAL_MS,
      timeoutMs: deps.timeoutMs ?? RENDERER_PROBE_TIMEOUT_MS,
      maxMisses: deps.maxMisses ?? RENDERER_PROBE_MAX_MISSES,
      onDead: () => {
        const before = goneSeen;
        try {
          deps.kill();
        } catch {
          /* already gone */
        }
        clearPending();
        pending = setTimeout(() => {
          pending = null;
          if (goneSeen === before) deps.stopped({ reason: "unresponsive" });
          // The page that replaces this one is watched too.
          heartbeat?.start();
        }, deps.graceMs ?? RENDERER_KILL_GRACE_MS);
        pending.unref?.();
      },
    });

  return {
    start() {
      heartbeat ??= make();
      heartbeat.start();
    },
    stop() {
      heartbeat?.stop();
      clearPending();
    },
    noteGone() {
      goneSeen += 1;
      const restart = pending !== null;
      clearPending();
      // The heartbeat stopped when it ended the process; the page that replaces it is watched too.
      if (restart) heartbeat?.start();
    },
  };
}
