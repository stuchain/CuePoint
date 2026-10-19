/**
 * The one way a length of time is written (consistency area 15): a track's length as
 * 3:45 or 1:03:45, a total as "33 h 11 min".
 */
import { NO_VALUE } from "../words";

/** A length shown for something with no known length. */
export const NO_LENGTH = NO_VALUE;

/**
 * Seconds as `m:ss`, or `h:mm:ss` from an hour up. Seconds are floored, so 179.9 is
 * 2:59 and never "2:60", the same as the player's clock. Unknown or negative is "—".
 */
export function formatLength(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return NO_LENGTH;
  }
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = String(whole % 60).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${secs}`;
  return `${minutes}:${secs}`;
}

/**
 * A total of many tracks: "33 h 11 min", "2 h", "45 min", "Under a minute". Minutes are
 * floored, so a total never reads longer than it is. Unknown or negative is "—".
 */
export function formatTotal(seconds: number | null | undefined, locale?: string): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return NO_LENGTH;
  }
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    const h = `${hours.toLocaleString(locale)} h`;
    return minutes > 0 ? `${h} ${minutes} min` : h;
  }
  return totalMinutes > 0 ? `${totalMinutes} min` : "Under a minute";
}

/**
 * A Set's length as a clock, always `h:mm:ss`: "1:23:45", "0:12:34". A Set is long enough that
 * every one reads in the same three parts, so a column of them lines up.
 */
export function formatSetLength(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return NO_LENGTH;
  }
  const whole = Math.floor(seconds);
  const minutes = Math.floor((whole % 3600) / 60);
  return `${Math.floor(whole / 3600)}:${String(minutes).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * An approximate span for a sentence, rounded: "about 6 hours", "about 2 minutes", "under a
 * minute". It rounds where `formatTotal` floors, because "left" and "takes" are estimates.
 * Unknown or negative is "—".
 */
export function aboutDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return NO_LENGTH;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}
