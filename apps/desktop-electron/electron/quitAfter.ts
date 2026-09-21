/**
 * Holding a quit until its cleanup has finished (EXPORT-07).
 *
 * Electron does not wait for a `before-quit` listener's promise. The listener
 * that stopped the player and then the engine was `async`, so the app could
 * finish quitting while it was still awaiting the player — and the engine,
 * stopped last, was then never stopped at all. On Windows that left the
 * packaged engine running after the app, on its port and holding the library
 * database; one was found that way in EXPORT-07's packaged runs.
 *
 * So the first quit is held: its default is prevented, the cleanup runs, and
 * the app is asked to quit again once it has finished — or once `timeoutMs`
 * has passed, because a quit that can hang forever is worse than one that
 * leaves something behind. What it leaves behind is covered from the other
 * side: the engine watches for the app and ends itself (`parent_watch.py`).
 */

export interface QuitEvent {
  preventDefault: () => void;
}

export interface QuittingApp {
  on: (event: "before-quit", listener: (event: QuitEvent) => void) => unknown;
  quit: () => void;
}

/** How long a quit waits for its cleanup before it goes ahead anyway. */
export const QUIT_CLEANUP_TIMEOUT_MS = 5000;

export function quitAfter(
  app: QuittingApp,
  cleanup: () => Promise<unknown>,
  {
    timeoutMs = QUIT_CLEANUP_TIMEOUT_MS,
    setTimer = (callback: () => void, ms: number) => setTimeout(callback, ms),
  }: {
    timeoutMs?: number;
    setTimer?: (callback: () => void, ms: number) => unknown;
  } = {},
): void {
  let state: "running" | "cleaning" | "done" = "running";

  app.on("before-quit", (event) => {
    // The second quit, asked for below, is let through.
    if (state === "done") return;
    event.preventDefault();
    // A quit asked for again while cleaning up waits for the same cleanup.
    if (state === "cleaning") return;
    state = "cleaning";

    const limit = new Promise<void>((resolve) => {
      setTimer(resolve, timeoutMs);
    });
    let finished: Promise<unknown>;
    try {
      finished = cleanup().catch(() => undefined);
    } catch {
      finished = Promise.resolve();
    }
    void Promise.race([finished, limit]).then(() => {
      state = "done";
      app.quit();
    });
  });
}
