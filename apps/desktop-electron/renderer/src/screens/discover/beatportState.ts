/**
 * What the Discover page says about Beatport, from DISCOVER-01's classes
 * (DISCOVER-10, DEC-098).
 *
 * The engine names one of five failures — no token, a token Beatport rejected,
 * one it refused for this, a rate limit, Beatport out of reach — and never the
 * token itself. Each is a different sentence and a different next step: a token
 * is fixed in Settings, and waiting is the only fix for the other two. The page
 * stays usable in every one of them: past runs and the wantlist are CuePoint's
 * own, and read without Beatport.
 */
import type {
  BeatportErrorClass,
  DiscoverBeatportState,
  DiscoverRefusal,
} from "../../api/cuepointBridge.types";

/** What the notice offers: Settings for the token, or asking again. */
export type BeatportNoticeAction = "settings" | "retry";

export interface BeatportNotice {
  state: BeatportErrorClass;
  headline: string;
  hint: string;
  action: BeatportNoticeAction;
}

/** Whole seconds, as a person reads a wait. */
function waitFor(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "in a little while";
  const whole = Math.ceil(seconds);
  if (whole < 90) return `in ${whole} ${whole === 1 ? "second" : "seconds"}`;
  const minutes = Math.ceil(whole / 60);
  return `in ${minutes} minutes`;
}

const STILL_USABLE = "Past runs and your wantlist still open without it.";

/**
 * The notice for a state, or null when Beatport answered.
 *
 * `message` is the engine's own sentence, shown only where it says more than
 * the class does: why Beatport could not be reached.
 */
export function beatportNotice(
  state: DiscoverBeatportState,
  message: string | null = null,
  retryAfter: number | null = null,
): BeatportNotice | null {
  switch (state) {
    case "ok":
      return null;
    case "no_token":
      return {
        state,
        headline: "Beatport is not connected",
        hint:
          "Discover needs a Beatport token to run and to push playlists. " + STILL_USABLE,
        action: "settings",
      };
    case "rejected":
      return {
        state,
        headline: "Beatport rejected the token",
        hint: `It may have expired. Enter a new one in Settings. ${STILL_USABLE}`,
        action: "settings",
      };
    case "forbidden":
      return {
        state,
        headline: "Beatport refused this token",
        hint:
          "The token works but is not allowed to do this; it may be missing a scope. " +
          `Enter one that is in Settings. ${STILL_USABLE}`,
        action: "settings",
      };
    case "rate_limited":
      return {
        state,
        headline: "Beatport is limiting requests",
        hint: `Try again ${waitFor(retryAfter)}. ${STILL_USABLE}`,
        action: "retry",
      };
    case "unavailable":
      return {
        state,
        headline: "Beatport cannot be reached",
        hint: `${message ? `${message}. ` : ""}Check the connection and try again. ${STILL_USABLE}`,
        action: "retry",
      };
  }
}

/** The Beatport state a refusal reports, or null when it is not Beatport's. */
export function refusalState(refusal: DiscoverRefusal | null): BeatportErrorClass | null {
  if (!refusal || refusal.code !== "BEATPORT_REFUSED") return null;
  return refusal.reason ?? "unavailable";
}

/**
 * Whether an action that asks Beatport is worth offering.
 *
 * A rate limit and an unreachable Beatport end by themselves, so a run or a
 * push is still offered and its refusal says so; a missing or refused token
 * does not, and offering a button that can only fail teaches nothing.
 */
export function beatportUsable(state: DiscoverBeatportState): boolean {
  return state !== "no_token" && state !== "rejected" && state !== "forbidden";
}

/** Why an action that asks Beatport is not offered, in the button's hint. */
export function unusableReason(state: DiscoverBeatportState): string | null {
  if (beatportUsable(state)) return null;
  return state === "no_token"
    ? "Needs a Beatport token, in Settings."
    : "Needs a Beatport token Beatport accepts, in Settings.";
}
