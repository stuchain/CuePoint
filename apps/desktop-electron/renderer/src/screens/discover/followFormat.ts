/**
 * The sentences the Following tab shows (FLW-follow).
 *
 * Pure functions, as the rest of Discover's wording is, so the lines can be tested as sentences.
 */
import type { FollowFeed, FollowRow } from "../../api/cuepointBridge.types";
import { formatDayInSentence } from "../../format/dates";
import { countNoun, formatCount } from "../../format/counts";
import { calendarDay } from "./discoverFormat";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "just now", "2 min ago", "3 hours ago", otherwise the day ("yesterday", "Nov 6"). */
export function checkedAgo(value: string | null, now: Date = new Date()): string {
  if (!value) return "not checked yet";
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "not checked yet";
  const age = now.getTime() - then.getTime();
  if (age < MINUTE) return "just now";
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < 24 * HOUR) return countNoun(Math.floor(age / HOUR), "hour") + " ago";
  return formatDayInSentence(then, { now });
}

/** The oldest day any follow was last seen through: what "since you last looked" means. */
export function oldestSeenThrough(follows: readonly FollowRow[]): string | null {
  let oldest: string | null = null;
  for (const follow of follows) {
    if (oldest === null || follow.seen_through < oldest) oldest = follow.seen_through;
  }
  return oldest;
}

/**
 * "14 new tracks since you last looked, Nov 6 · checked 2 min ago · 3 you own hidden". The
 * hidden part is left out when nothing is hidden.
 */
export function followStatusLine(
  feed: Pick<FollowFeed, "total" | "hidden_owned" | "checked_at">,
  seenThrough: string | null,
  now: Date = new Date(),
): string {
  const day = seenThrough ? formatDayInSentence(calendarDay(seenThrough), { now }) : "";
  const parts = [`${countNoun(feed.total, "new track")} since you last looked${day ? `, ${day}` : ""}`];
  parts.push(`checked ${checkedAgo(feed.checked_at, now)}`);
  if (feed.hidden_owned > 0) parts.push(`${formatCount(feed.hidden_owned)} you own hidden`);
  return parts.join(" · ");
}

/** The count chip beside a name or the tab: "4" reads as "4 new" in words for a screen reader. */
export function newCountWords(count: number): string {
  return `${formatCount(count)} new`;
}

/** A follow's key, for selecting it and for a React key. */
export function followKey(follow: { kind: string; beatport_id: number }): string {
  return `${follow.kind}:${follow.beatport_id}`;
}
