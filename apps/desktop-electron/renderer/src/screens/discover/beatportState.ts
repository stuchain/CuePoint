/**
 * What the Discover page says about Beatport, from DISCOVER-01's classes
 * (DISCOVER-10, DEC-098).
 *
 * The engine names one of five failures — no token, a token Beatport rejected,
 * one it refused for this, a rate limit, Beatport out of reach — and never the
 * token itself. Each notice is one line with one next step: a missing, ended or
 * refused sign-in is fixed by signing in to Beatport (C12), and waiting is the
 * only fix for the other two. The page stays
 * usable in every one of them: past searches and the wantlist are CuePoint's
 * own, and read without Beatport (DEC-098).
 *
 * The words are a DJ's (DSC-3): a person signs in to Beatport, and a refusal
 * never says "scope".
 */
import type {
  BeatportErrorClass,
  DiscoverBeatportState,
  DiscoverRefusal,
} from "../../api/cuepointBridge.types";

/** What the notice offers: signing in to Beatport (again), or asking again. */
type BeatportNoticeAction = "signin" | "retry";

interface BeatportNotice {
  state: BeatportErrorClass;
  headline: string;
  hint: string;
  action: BeatportNoticeAction;
  /** The button's words: "Sign in to Beatport", "Sign in again", "Open Settings", "Try again". */
  actionLabel: string;
}

/** Whole seconds, as a person reads a wait. */
function waitFor(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "a little while";
  const whole = Math.ceil(seconds);
  if (whole < 90) return `${whole} ${whole === 1 ? "second" : "seconds"}`;
  const minutes = Math.ceil(whole / 60);
  return `${minutes} minutes`;
}

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
        headline: "Sign in to Beatport to search its charts and releases.",
        hint: "",
        action: "signin",
        actionLabel: "Sign in to Beatport",
      };
    case "rejected":
      return {
        state,
        headline: "Beatport sign-in ended or was refused.",
        hint: "",
        action: "signin",
        actionLabel: "Sign in again",
      };
    case "forbidden":
      return {
        state,
        headline: "Beatport refused this sign-in.",
        hint: "",
        action: "signin",
        actionLabel: "Sign in again",
      };
    case "rate_limited":
      return {
        state,
        headline: "Beatport is limiting requests",
        hint: `Wait ${waitFor(retryAfter)}.`,
        action: "retry",
        actionLabel: "Try again",
      };
    case "unavailable":
      return {
        state,
        headline: "Beatport cannot be reached",
        hint: message ? `${message.replace(/\.$/, "")}.` : "",
        action: "retry",
        actionLabel: "Try again",
      };
  }
}

/** The states whose headline already says all there is to say. */
export const TOKEN_STATES: ReadonlySet<string> = new Set(["no_token", "rejected", "forbidden"]);

/** The Beatport state a refusal reports, or null when it is not Beatport's. */
export function refusalState(refusal: DiscoverRefusal | null): BeatportErrorClass | null {
  if (!refusal || refusal.code !== "BEATPORT_REFUSED") return null;
  return refusal.reason ?? "unavailable";
}

/**
 * Whether an action that asks Beatport is worth offering.
 *
 * A rate limit and an unreachable Beatport end by themselves, so a search or a
 * playlist is still offered and its refusal says so; a missing or refused token
 * does not, and offering a button that can only fail teaches nothing.
 */
export function beatportUsable(state: DiscoverBeatportState): boolean {
  return state !== "no_token" && state !== "rejected" && state !== "forbidden";
}

/** Why an action that asks Beatport is not offered, in the button's hint. */
export function unusableReason(state: DiscoverBeatportState): string | null {
  if (beatportUsable(state)) return null;
  return state === "forbidden" ? "Beatport refused this sign-in." : "Needs a Beatport sign-in.";
}
