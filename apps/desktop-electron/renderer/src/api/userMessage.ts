/**
 * The one place a failure becomes words for the user.
 *
 * Every catch that shows a problem calls `userMessage`. When the engine (CuePoint's
 * background process) is unreachable, the raw text ("fetch failed", "Engine not running")
 * means nothing to a person, so they read one sentence instead. Any other error keeps its
 * own message: the engine words its refusals for the user already.
 */
import { bridgeErrorFields } from "./bridgeError";
import type { CuePointBridge } from "./cuepointBridge.types";
import { noteOutage } from "./engineOnline";

/** What the user reads when the background process cannot be reached. */
export const OUTAGE_MESSAGE = "CuePoint lost touch with its background process. Nothing was changed.";

/** What the user reads when a feature needs the desktop app and this window has no bridge. */
export const NEEDS_DESKTOP = "This needs the CuePoint desktop app.";

/** The same outage, once a job had started: some of its work may be done. */
export const OUTAGE_PARTWAY_MESSAGE =
  "CuePoint lost touch with its background process partway through. Activity shows what was done.";

/**
 * The engine is not there: stopped, starting or restarting. Polled calls fail this way every few
 * seconds for as long as it lasts, so it is not a bug report; main reports an outage once
 * (REPORT-05). Main marks such an error `UNAVAILABLE` across the bridge. A 5xx answer is never
 * an outage by itself: the engine was there and failed.
 */
export function isEngineOutage(
  error: unknown,
  bridge?: Pick<CuePointBridge, "engineErrorFields">,
): boolean {
  if (bridgeErrorFields(error, bridge).code === "UNAVAILABLE") return true;
  if (!(error instanceof Error)) return false;
  return error.message.startsWith("Engine not running") || error.message === "fetch failed";
}

/** The audio player is not there. Main marks it `PLAYER_UNAVAILABLE`; the rest of CuePoint works. */
export function isPlayerOutage(
  error: unknown,
  bridge?: Pick<CuePointBridge, "engineErrorFields">,
): boolean {
  return bridgeErrorFields(error, bridge).code === "PLAYER_UNAVAILABLE";
}

/** Either outage: neither is a bug, so neither is reported. */
export function isOutage(
  error: unknown,
  bridge?: Pick<CuePointBridge, "engineErrorFields">,
): boolean {
  return isEngineOutage(error, bridge) || isPlayerOutage(error, bridge);
}

/** Words already chosen for the user; a later `userMessage` must not reword them. */
const OWN_WORDS: readonly string[] = [NEEDS_DESKTOP, OUTAGE_MESSAGE, OUTAGE_PARTWAY_MESSAGE];

/**
 * The sentence to show for a caught failure. Never throws. `partway` says a job had already
 * started, so an outage cannot promise that nothing was changed.
 */
export function userMessage(cause: unknown, fallback?: string, options?: { partway?: boolean }): string {
  try {
    if (cause instanceof Error && OWN_WORDS.includes(cause.message)) return cause.message;
    if (isEngineOutage(cause)) {
      // The one banner learns of it now rather than at the next poll.
      noteOutage();
      return options?.partway ? OUTAGE_PARTWAY_MESSAGE : OUTAGE_MESSAGE;
    }
    if (cause instanceof Error) return cause.message;
    return fallback ?? String(cause);
  } catch {
    return fallback ?? "Something went wrong.";
  }
}
