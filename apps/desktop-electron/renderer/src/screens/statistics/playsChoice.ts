/**
 * What the Plays section was asked for (STATS-05): how many tracks, and since when.
 *
 * Pure, so the words and the dates can be checked without drawing the section. The
 * choice is remembered in `cuepoint-statistics-plays` as `{ limit, since }`.
 *
 * Dates are the person's own local days. A "Since" date is sent as `YYYY-MM-DD` with the UTC
 * offset in effect at local midnight of that date (not today's), so a day on the other side of
 * a daylight-saving change is still its own midnight.
 */
import type { StatisticsPlaysParams } from "../../api/cuepointBridge.types";

export const PLAYS_STORAGE_KEY = "cuepoint-statistics-plays";

export const PLAYS_LIMITS = [10, 25, 50, 100, 200] as const;
export type PlaysLimit = (typeof PLAYS_LIMITS)[number];

/** `refresh`, a number of days, a year, all time, or `date:YYYY-MM-DD` (empty until one is typed). */
export type PlaysSince = "refresh" | "7d" | "30d" | "90d" | "year" | "all" | `date:${string}`;

export interface PlaysChoice {
  limit: PlaysLimit;
  since: PlaysSince;
}

export const DEFAULT_PLAYS_CHOICE: PlaysChoice = { limit: 10, since: "all" };

/** The Since choices, in the order DEC-166 lists them; "A date" stands for every `date:` value. */
export const SINCE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "refresh", label: "Your last refresh" },
  { value: "7d", label: "The last 7 days" },
  { value: "30d", label: "The last 30 days" },
  { value: "90d", label: "The last 90 days" },
  { value: "year", label: "The last year" },
  { value: "all", label: "All time" },
  { value: "date", label: "A date…" },
];

/** The earliest year a "Since" date may have; the route refuses years outside 1900 to 9998. */
export const FIRST_YEAR = 1900;

/**
 * A complete, real calendar day (`YYYY-MM-DD`) with a year from 1900 to the current one. A
 * partly typed date (`0002-09-01`) is not one, so it is never saved or sent.
 */
export function isValidDay(day: string, now: Date = new Date()): boolean {
  const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!found) return false;
  const [y, m, d] = [Number(found[1]), Number(found[2]), Number(found[3])];
  if (y < FIRST_YEAR || y > now.getFullYear()) return false;
  const at = new Date(y, m - 1, d);
  return at.getFullYear() === y && at.getMonth() === m - 1 && at.getDate() === d;
}

export function isPlaysSince(value: unknown, now: Date = new Date()): value is PlaysSince {
  if (typeof value !== "string") return false;
  if (["refresh", "7d", "30d", "90d", "year", "all"].includes(value)) return true;
  return value === "date:" || (value.startsWith("date:") && isValidDay(value.slice(5), now));
}

export function loadPlaysChoice(): PlaysChoice {
  try {
    const raw = window.localStorage.getItem(PLAYS_STORAGE_KEY);
    if (!raw) return DEFAULT_PLAYS_CHOICE;
    const parsed = JSON.parse(raw) as { limit?: unknown; since?: unknown } | null;
    const limit = PLAYS_LIMITS.find((n) => n === parsed?.limit);
    return {
      limit: limit ?? DEFAULT_PLAYS_CHOICE.limit,
      since: isPlaysSince(parsed?.since) ? parsed.since : DEFAULT_PLAYS_CHOICE.since,
    };
  } catch {
    return DEFAULT_PLAYS_CHOICE;
  }
}

export function savePlaysChoice(choice: PlaysChoice): void {
  try {
    window.localStorage.setItem(
      PLAYS_STORAGE_KEY,
      JSON.stringify({ limit: choice.limit, since: choice.since }),
    );
  } catch {
    // Not remembered; the section still works.
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A local day as `YYYY-MM-DD`. */
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The offset in effect at local midnight of `day`, as `+HH:MM` or `-HH:MM`. */
export function offsetAtMidnight(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const minutes = -new Date(y, m - 1, d).getTimezoneOffset() || 0;
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The local day a relative choice starts on, or the typed date; null for the rest. */
export function sinceDay(since: PlaysSince, now: Date): string | null {
  if (since.startsWith("date:")) {
    const day = since.slice(5);
    return isValidDay(day, now) ? day : null;
  }
  const back = { "7d": 7, "30d": 30, "90d": 90 }[since as "7d" | "30d" | "90d"];
  if (back !== undefined) {
    return localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
  }
  if (since === "year") {
    return localDay(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()));
  }
  return null;
}

/**
 * The route's parameters for a choice. "Your last refresh" needs the id of the last read,
 * which the route reports (`last_read_id`); until it is known the parameters ask for all
 * time and the caller asks again.
 */
export function playsParams(
  choice: PlaysChoice,
  lastReadId: number | null,
  now: Date = new Date(),
): StatisticsPlaysParams {
  const params: StatisticsPlaysParams = { limit: choice.limit };
  if (choice.since === "refresh") {
    if (lastReadId !== null) params.sinceRead = String(lastReadId);
    return params;
  }
  const day = sinceDay(choice.since, now);
  if (day !== null) {
    params.since = day;
    params.tz = offsetAtMidnight(day);
  }
  return params;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `Sep 1, 2026` from a `YYYY-MM-DD` day. */
export function dayWords(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** `Nov 2`, or `Nov 2, 2025` in another year, from a stored UTC timestamp, in local time. */
export function stampWords(stamp: string, now: Date = new Date()): string {
  const at = new Date(stamp);
  if (Number.isNaN(at.getTime())) return "";
  const short = `${MONTHS[at.getMonth()]} ${at.getDate()}`;
  return at.getFullYear() === now.getFullYear() ? short : `${short}, ${at.getFullYear()}`;
}

/** The local `YYYY-MM-DD` of a stored UTC timestamp. */
function stampDay(stamp: string): string | null {
  const at = new Date(stamp);
  return Number.isNaN(at.getTime()) ? null : localDay(at);
}

interface NamedAnswer {
  since: string | null;
  since_clamped: boolean;
  history_from: string | null;
  last_read: string | null;
}

/**
 * The name a kept list is given: "Most played since Sep 1, 2026 (top 50)", or "Most played,
 * all time (top 50)". It names the day the counts really begin: the day history starts when
 * the chosen date was earlier than that, the last refresh's day for "Your last refresh", and
 * the chosen or computed day otherwise.
 */
export function collectionName(
  choice: PlaysChoice,
  answer: NamedAnswer,
  now: Date = new Date(),
): string {
  const top = `(top ${choice.limit})`;
  let day: string | null = null;
  if (choice.since === "refresh") {
    day = answer.last_read ? stampDay(answer.last_read) : null;
  } else if (choice.since !== "all") {
    day =
      answer.since_clamped && answer.history_from
        ? stampDay(answer.history_from)
        : (answer.since ?? sinceDay(choice.since, now));
  }
  return day ? `Most played since ${dayWords(day)} ${top}` : `Most played, all time ${top}`;
}
