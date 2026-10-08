import type { ConsentChoice } from "./consent";

/**
 * The events the site counts with Umami Cloud (DEC-192, DEC-142). They are exactly the ones the privacy
 * policy lists. No event carries personal data: each has a small fixed set of keys, and anything else
 * is dropped before it is sent. (The sound button the spec names does not exist yet; its event is added
 * with it, and the policy already says so.)
 */
export const EVENTS = {
  download: "download",
  formSent: "form-sent",
  themeChange: "theme-change",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** The keys each event may carry. Everything else is dropped. */
const ALLOWED_KEYS: Readonly<Record<EventName, readonly string[]>> = {
  download: ["system", "chip"],
  "form-sent": ["form"],
  "theme-change": ["theme"],
};

export interface UmamiLike {
  track: (name: string, data?: Record<string, string>) => void;
}

/** Sends one event if Umami is loaded; does nothing otherwise, and never throws into the page. */
export function trackEvent(
  name: EventName,
  data: Readonly<Record<string, string>>,
  target: { umami?: UmamiLike } = globalThis as { umami?: UmamiLike },
): void {
  const umami = target.umami;
  if (!umami || typeof umami.track !== "function") return;
  const allowed = ALLOWED_KEYS[name] ?? [];
  const clean = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));
  try {
    umami.track(name, clean);
  } catch {
    /* counting must never break the page */
  }
}

/**
 * Whether the Umami script is added to the page: only in a public build (a preview never sends an event
 * to the real account), and, if a cookie outside the allow list made the consent banner appear, only
 * after the visitor said yes.
 */
export function shouldLoadAnalytics(state: { isPublic: boolean; consentNeeded: boolean; choice: ConsentChoice | null }): boolean {
  if (!state.isPublic) return false;
  return !state.consentNeeded || state.choice === "yes";
}
