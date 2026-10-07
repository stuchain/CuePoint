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

/**
 * What to throw from an IPC handler for `error`: an `EngineError` becomes a plain
 * `Error` whose message carries the fields; anything else is returned as it was.
 */
export function bridgeSafeError(error: unknown): unknown {
  if (!(error instanceof EngineError)) return error;
  const fields = { status: error.status, code: error.code, reportId: error.reportId };
  return new Error(error.message + BRIDGE_ERROR_MARKER + JSON.stringify(fields));
}
