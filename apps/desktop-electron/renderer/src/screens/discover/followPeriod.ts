/**
 * Which releases the Following tab lists: what is new since you last looked, the last 7, 30 or 90
 * days, or a range of days you pick. The choice is remembered (the tab opens on it next time);
 * Last 30 days is the first one. A period lists every release in it, seen or not, with the new
 * ones marked; "new since you last looked" lists the new ones only.
 *
 * Pure, so the dates can be tested: days are calendar days on this computer, as the engine's are.
 */
import { formatDayInSentence } from "../../format/dates";

export type FollowPeriodChoice =
  | { kind: "new" }
  | { kind: "days"; days: 7 | 30 | 90 }
  | { kind: "custom"; since: string; until: string | null };

export const FOLLOW_PERIOD_STORAGE_KEY = "cuepoint-following-period";
export const DEFAULT_FOLLOW_PERIOD: FollowPeriodChoice = { kind: "days", days: 30 };
/** How far back a range may start: the engine's own limit. */
export const MAX_PERIOD_DAYS = 366;
/** A label's releases are kept for this many days (an artist's for a year). */
export const LABEL_LISTING_DAYS = 90;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A day as "2026-11-17", on this computer's calendar. */
export function isoDay(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
}

/** `n` calendar days before `today`. */
export function daysBefore(today: Date, n: number): string {
  return isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
}

function parseDay(value: string): Date | null {
  if (!ISO_DAY.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const day = new Date(y, m - 1, d);
  return day.getFullYear() === y && day.getMonth() === m - 1 && day.getDate() === d ? day : null;
}

/** A choice read back from storage, or null when it is not one this tab takes. */
export function readPeriod(raw: string | null): FollowPeriodChoice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (value.kind === "new") return { kind: "new" };
    if (value.kind === "days" && (value.days === 7 || value.days === 30 || value.days === 90)) {
      return { kind: "days", days: value.days };
    }
    if (
      value.kind === "custom" &&
      typeof value.since === "string" &&
      parseDay(value.since) &&
      (value.until === null || (typeof value.until === "string" && parseDay(value.until)))
    ) {
      return { kind: "custom", since: value.since, until: value.until as string | null };
    }
  } catch {
    // Not JSON: not a choice.
  }
  return null;
}

/** The choice remembered, or Last 30 days. */
export function loadPeriod(): FollowPeriodChoice {
  try {
    return readPeriod(localStorage.getItem(FOLLOW_PERIOD_STORAGE_KEY)) ?? DEFAULT_FOLLOW_PERIOD;
  } catch {
    return DEFAULT_FOLLOW_PERIOD;
  }
}

export function savePeriod(choice: FollowPeriodChoice): void {
  try {
    localStorage.setItem(FOLLOW_PERIOD_STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Not remembered; the choice still holds for this visit.
  }
}

/**
 * The dates the engine is asked for: none for "new since you last looked". A range is kept inside
 * what the engine answers (a year back at most, ending today at the latest), so a range remembered
 * long ago still reads.
 */
export function periodRange(
  choice: FollowPeriodChoice,
  today: Date = new Date(),
): { since?: string; until?: string } {
  if (choice.kind === "new") return {};
  const todayIso = isoDay(today);
  if (choice.kind === "days") return { since: daysBefore(today, choice.days) };
  const earliest = daysBefore(today, MAX_PERIOD_DAYS);
  let until = choice.until && choice.until < todayIso ? choice.until : todayIso;
  let since = choice.since < earliest ? earliest : choice.since;
  if (since > todayIso) since = todayIso;
  if (since > until) until = since;
  return until === todayIso ? { since } : { since, until };
}

/** A key for the window: changes whenever the dates asked for change. */
export function periodKey(choice: FollowPeriodChoice, today: Date = new Date()): string {
  const range = periodRange(choice, today);
  return range.since ? `${range.since}..${range.until ?? ""}` : "new";
}

/** The custom range as the menu writes it: "Oct 1 – Nov 17", "Oct 1 – today". */
export function customLabel(since: string, until: string | null, now: Date = new Date()): string {
  const from = parseDay(since);
  const to = until ? parseDay(until) : null;
  const start = from ? formatDayInSentence(from, { now }) : since;
  const end = to ? formatDayInSentence(to, { now }) : "today";
  return `${start} – ${end}`;
}

/** The menu's value for a choice. */
export function periodValue(choice: FollowPeriodChoice): string {
  if (choice.kind === "new") return "new";
  if (choice.kind === "days") return String(choice.days);
  return "custom";
}

/** The menu's options; the custom one names its range once there is one. */
export function periodOptions(choice: FollowPeriodChoice, now: Date = new Date()) {
  return [
    { value: "new", label: "New since you last looked" },
    { value: "7", label: "Last 7 days" },
    { value: "30", label: "Last 30 days" },
    { value: "90", label: "Last 90 days" },
    {
      value: "custom",
      label: choice.kind === "custom" ? customLabel(choice.since, choice.until, now) : "Custom range…",
    },
  ];
}

/** Whether a range reaches back past what a label's listing keeps: the tab says so. */
export function reachesPastLabels(choice: FollowPeriodChoice, today: Date = new Date()): boolean {
  const range = periodRange(choice, today);
  return range.since !== undefined && range.since < daysBefore(today, LABEL_LISTING_DAYS);
}
