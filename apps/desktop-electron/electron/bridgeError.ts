/**
 * An engine error that survives `ipcMain.handle` (REPORT-04, DEC-126).
 *
 * Electron rebuilds a rejected `invoke` in the renderer from the error's message
 * alone: `status`, `code` and `reportId` on an `EngineError` are dropped on the
 * way. So main appends them to the message after a fixed marker, and
 * `preload.cjs` (which cannot import this file) splits them off again. The
 * marker begins with a NUL, which no engine message contains; it travels through
 * IPC intact (checked by `e2e/reportErrors.spec.ts`).
 */
import { EngineError } from "./engineClient";

/** Keep equal to `ERROR_MARKER` in `preload.cjs`; `preloadErrors.test.ts` holds them to it. */
export const BRIDGE_ERROR_MARKER = "\u0000cuepoint-error:";

/** What main knows about an error that the page should not have to guess. */
export interface BridgeErrorExtra {
  /** The event id main reported the error under, so the page does not report it again. */
  reportId?: string | null;
  /** `UNAVAILABLE` when the engine or the player is not there: an outage, not a bug. */
  code?: string;
}

/**
 * What to throw from an IPC handler for `error`: an `EngineError` becomes a plain
 * `Error` whose message carries the fields (with main's own `reportId` when the engine
 * made none); any other error carries them only when `extra` has something to say;
 * otherwise it is returned as it was.
 */
export function bridgeSafeError(error: unknown, extra: BridgeErrorExtra = {}): unknown {
  if (error instanceof EngineError) {
    const fields = { status: error.status, code: error.code, reportId: error.reportId ?? extra.reportId ?? null };
    return new Error(error.message + BRIDGE_ERROR_MARKER + JSON.stringify(fields));
  }
  if (!extra.reportId && !extra.code) return error;
  const fields = { status: null, code: extra.code ?? null, reportId: extra.reportId ?? null };
  const message = error instanceof Error ? error.message : String(error);
  return new Error(message + BRIDGE_ERROR_MARKER + JSON.stringify(fields));
}
