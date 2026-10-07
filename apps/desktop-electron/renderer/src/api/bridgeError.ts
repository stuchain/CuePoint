/**
 * Reading the status, code and report id of an error from the bridge (REPORT-04, DEC-126).
 *
 * The preload gives each rejection `status`, `code` and `reportId`, but `contextBridge`
 * rebuilds an Error in the page from its message alone and drops them, so the page asks
 * the bridge by message when the error has none (`engineErrorFields`). `message` is the
 * engine's words either way, so a `catch` that only shows it keeps working.
 *
 * Needed by REPORT-06: the renderer does not report an engine refusal, and does not
 * report a 500 the engine already reported.
 */
import type { BridgeErrorFields, CuePointBridge } from "./cuepointBridge.types";

const NONE: BridgeErrorFields = { status: null, code: null, reportId: null };

function ownFields(error: object): BridgeErrorFields | null {
  const { status, code, reportId } = error as Record<string, unknown>;
  if (typeof status !== "number" && typeof code !== "string" && typeof reportId !== "string") return null;
  return {
    status: typeof status === "number" ? status : null,
    code: typeof code === "string" ? code : null,
    reportId: typeof reportId === "string" ? reportId : null,
  };
}

/** The error's fields: its own, else the bridge's record of it, else all null. Never throws. */
export function bridgeErrorFields(
  error: unknown,
  bridge: Pick<CuePointBridge, "engineErrorFields"> | undefined = typeof window === "undefined"
    ? undefined
    : window.cuepoint,
): BridgeErrorFields {
  if (typeof error !== "object" || error === null) return { ...NONE };
  const own = ownFields(error);
  if (own !== null) return own;
  const message = (error as { message?: unknown }).message;
  if (typeof message === "string" && typeof bridge?.engineErrorFields === "function") {
    try {
      const found = bridge.engineErrorFields(message);
      if (found) return { ...NONE, ...found };
    } catch {
      // Not worth a failure: the error is then read as having no fields.
    }
  }
  return { ...NONE };
}

/** True for an engine answer below 500: the engine refused, and nothing is broken. */
export function isEngineRefusal(
  error: unknown,
  bridge?: Pick<CuePointBridge, "engineErrorFields">,
): boolean {
  const { status } = bridgeErrorFields(error, bridge);
  return status !== null && status < 500;
}
