/**
 * When the library is looked at for damage (HARDEN-03, DEC-181).
 *
 * `PRAGMA quick_check` runs in the engine, on a thread, while the library stays usable. Main decides
 * when to ask for it: after an unclean exit (`sessionLock.ts`), and once every 7 days (the date is
 * kept in main's settings). Both only after the window has shown and the engine says the library
 * is `ok`, so it is never in the way of the first paint, and never at all when the library already
 * has a screen of its own to show. The date is recorded only when the check finished and passed.
 *
 * Nothing here waits for anything the window waits for: `afterFirstPaint()` returns at once and
 * the work follows on timers and the engine's own answers.
 */
import type { LibraryStatus } from "./engineClient";

/** Once every 7 days. */
export const INTEGRITY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** How often the engine's state, and then its check, is looked at while waiting. */
export const INTEGRITY_POLL_MS = 2_000;
/** How long the library may take to reach `ok` before this session gives up on asking. */
export const INTEGRITY_READY_WAIT_MS = 10 * 60_000;
/** How long the check may run before this session stops waiting for its answer. */
export const INTEGRITY_RUN_WAIT_MS = 60 * 60_000;

/** Whether a check is due: after an unclean exit, never done, or done 7 days ago or more. */
export function integrityCheckDue(input: {
  uncleanExit: boolean;
  /** A check owed from an unclean exit that no check has finished since. */
  owed?: boolean;
  lastCheckedAt: string | null;
  now: number;
}): boolean {
  if (input.uncleanExit || input.owed) return true;
  if (input.lastCheckedAt === null) return true;
  const last = Date.parse(input.lastCheckedAt);
  if (Number.isNaN(last)) return true;
  // A date in the future (a clock set back) is not "recent": ask again.
  if (last > input.now) return true;
  return input.now - last >= INTEGRITY_INTERVAL_MS;
}

export interface IntegrityCheckDeps {
  engine: {
    getLibraryStatus(): Promise<LibraryStatus>;
    startIntegrityCheck(): Promise<unknown>;
  };
  settings: {
    read(): { lastIntegrityCheckAt: string | null; integrityCheckOwed: boolean };
    update(patch: { lastIntegrityCheckAt?: string | null; integrityCheckOwed?: boolean }): unknown;
  };
  /** Whether the last session ended uncleanly (`sessionLock.ts`). */
  uncleanExit: () => boolean;
  now?: () => number;
  /** Waits; replaced in tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Told the library's state after a check that did not pass, so the page can show its screen. */
  onChanged?: (library: LibraryStatus) => void;
  pollMs?: number;
  readyWaitMs?: number;
  runWaitMs?: number;
}

export type IntegrityOutcome =
  /** Not due: the engine was not even asked. */
  | "not-due"
  /** A fresh profile: today is recorded as the start of the weekly clock, and nothing was asked. */
  | "baseline"
  /** The library was not `ok` (or never became so) in time: nothing was asked. */
  | "not-ready"
  | "passed"
  | "failed"
  /** The check did not finish, or its answer was lost: not recorded, not retried this session. */
  | "unfinished";

export class IntegrityChecker {
  private started = false;

  constructor(private readonly deps: IntegrityCheckDeps) {}

  /**
   * Called at start, before the window: an unclean exit is written down as a check owed, so it
   * survives a quit or a crash before the check has run. Never throws.
   */
  noteStart(): void {
    if (!this.deps.uncleanExit()) return;
    try {
      this.deps.settings.update({ integrityCheckOwed: true });
    } catch {
      /* the check still runs this session */
    }
  }

  /**
   * Called once the window has shown. Returns at once; the check follows in the background and
   * the returned promise (which never rejects) is for tests and for whoever wants the outcome.
   * A second call is a no-op: once per session.
   */
  afterFirstPaint(): Promise<IntegrityOutcome> {
    if (this.started) return Promise.resolve("not-due");
    this.started = true;
    return this.run().catch(() => "unfinished" as const);
  }

  private async run(): Promise<IntegrityOutcome> {
    const now = this.deps.now ?? Date.now;
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref?.()));
    const pollMs = this.deps.pollMs ?? INTEGRITY_POLL_MS;

    const saved = this.deps.settings.read();
    const unclean = this.deps.uncleanExit();
    // A fresh profile has nothing to check yet: the weekly clock starts at the first launch.
    if (!unclean && !saved.integrityCheckOwed && saved.lastIntegrityCheckAt === null) {
      this.deps.settings.update({ lastIntegrityCheckAt: new Date(now()).toISOString() });
      return "baseline";
    }
    const due = integrityCheckDue({
      uncleanExit: unclean,
      owed: saved.integrityCheckOwed,
      lastCheckedAt: saved.lastIntegrityCheckAt,
      now: now(),
    });
    if (!due) return "not-due";

    // Wait for the engine to say the library is ok. A library with a state of its own to show
    // (damaged, too new, ...) is not checked on top of it; an engine that is not up yet is waited for.
    const readyBy = now() + (this.deps.readyWaitMs ?? INTEGRITY_READY_WAIT_MS);
    for (;;) {
      let state: LibraryStatus["state"] | null = null;
      try {
        state = (await this.deps.engine.getLibraryStatus()).state;
      } catch {
        state = null; // not answering yet
      }
      if (state === "ok") break;
      if (state !== null && state !== "upgrading") return "not-ready";
      if (now() >= readyBy) return "not-ready";
      await sleep(pollMs);
    }

    await this.deps.engine.startIntegrityCheck();

    const doneBy = now() + (this.deps.runWaitMs ?? INTEGRITY_RUN_WAIT_MS);
    for (;;) {
      await sleep(pollMs);
      let library: LibraryStatus | null = null;
      try {
        library = await this.deps.engine.getLibraryStatus();
      } catch {
        library = null;
      }
      const check = library?.integrityCheck.state;
      if (library && check === "ok") {
        this.deps.settings.update({
          lastIntegrityCheckAt: new Date(now()).toISOString(),
          integrityCheckOwed: false,
        });
        return "passed";
      }
      if (library && check === "failed") {
        // Finished, and the answer is the damaged screen's to give: nothing more is owed.
        this.deps.settings.update({ integrityCheckOwed: false });
        // The engine has marked the library damaged; the page is told so it can show the screen.
        try {
          this.deps.onChanged?.(library);
        } catch {
          /* what the page does with it is not this check's */
        }
        return "failed";
      }
      if (library && check === "idle") return "unfinished";
      if (now() >= doneBy) return "unfinished";
    }
  }
}

/**
 * Wait for the library's state to settle after "Try again" (`POST /api/v1/library/recheck`, which
 * answers at once with `upgrading`), and answer where it came to. Null when the engine could not be
 * asked or `maxMs` ran out first. Polls the cached status, which is cheap.
 */
export async function settledLibrary(
  engine: { getLibraryStatus(): Promise<LibraryStatus> },
  options: { pollMs?: number; maxMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<LibraryStatus | null> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref?.()));
  const until = now() + (options.maxMs ?? INTEGRITY_READY_WAIT_MS);
  for (;;) {
    try {
      const library = await engine.getLibraryStatus();
      if (library.state !== "upgrading") return library;
    } catch {
      /* not answering yet */
    }
    if (now() >= until) return null;
    await sleep(options.pollMs ?? 1_000);
  }
}
