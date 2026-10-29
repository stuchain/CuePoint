/**
 * A window that stopped (HARDEN-05).
 *
 * When the renderer process goes (`render-process-gone`, any reason but a clean exit), main reloads
 * the window once and the page says "CuePoint's window stopped and was reopened.". A second stop
 * within a minute of the first is not worth a third try by itself: the window is replaced by a
 * plain page, `recovery.html`, with no app bundle, which offers Reload and Report this problem.
 * That page runs in its own small window with its own preload, which exposes only `reload` and
 * `report` (`recoveryPreload.cjs`); both run in main.
 *
 * This file is the decision, with the clock and the actions handed in, so it can be tested; what
 * is done to a window is `main.ts`'s.
 */
import path from "node:path";

/** Two stops inside this long of each other send the person to the recovery page. */
export const RECOVERY_WINDOW_MS = 60_000;

/** What the page says after the window was reopened, word for word. */
export const WINDOW_REOPENED_MESSAGE = "CuePoint's window stopped and was reopened.";

/** The channels the recovery page's two calls use; main handles exactly these. */
export const RECOVERY_RELOAD_CHANNEL = "recovery:reload";
export const RECOVERY_REPORT_CHANNEL = "recovery:report";

export type RecoveryAction = "ignored" | "reloaded" | "recovery-page";

export interface RendererRecoveryDeps {
  now: () => number;
  /** The app is quitting: a window that goes then is no reason to reopen anything. */
  isQuitting?: () => boolean;
  /** Reload the window, and say it was reopened. */
  reload: () => void;
  /** Replace the window with the recovery page. */
  showRecoveryPage: () => void;
}

/** The part of Electron's `RenderProcessGoneDetails` this reads. */
export interface RendererGoneDetails {
  reason: string;
}

export function createRendererRecovery(deps: RendererRecoveryDeps): {
  handle: (details: RendererGoneDetails) => RecoveryAction;
  /** Forget the stops so far: the person pressed Reload on the recovery page. */
  reset: () => void;
} {
  let stops: number[] = [];
  return {
    handle(details) {
      if (details.reason === "clean-exit" || deps.isQuitting?.()) return "ignored";
      const now = deps.now();
      stops = [...stops.filter((at) => now - at < RECOVERY_WINDOW_MS), now];
      if (stops.length >= 2) {
        stops = [];
        deps.showRecoveryPage();
        return "recovery-page";
      }
      deps.reload();
      return "reloaded";
    },
    reset() {
      stops = [];
    },
  };
}

/**
 * Where the recovery page and its preload are, beside the bundle that asks for them: both ship in
 * `electron/` next to `electron-dist/` in the source tree and in `app.asar`, as `preload.cjs` does.
 */
export function resolveRecoveryPaths(bundleDir: string): { page: string; preload: string } {
  const folder = path.join(bundleDir, "..", "electron");
  return { page: path.join(folder, "recovery.html"), preload: path.join(folder, "recoveryPreload.cjs") };
}
