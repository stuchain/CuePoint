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

/**
 * The oldest follow's last look: the day it was seen through, and the moment (`seen_at`, null for a
 * follow never marked seen) that decides how the status line words the start of what is new.
 */
export function oldestLook(
  follows: readonly FollowRow[],
): { seenThrough: string; seenAt: string | null } | null {
  let oldest: FollowRow | null = null;
  for (const follow of follows) {
    if (oldest === null || follow.seen_through < oldest.seen_through) oldest = follow;
  }
  return oldest ? { seenThrough: oldest.seen_through, seenAt: oldest.seen_at ?? null } : null;
}

/** The oldest day any follow was last seen through: the start of what is new. */
export function oldestSeenThrough(follows: readonly FollowRow[]): string | null {
  let oldest: string | null = null;
  for (const follow of follows) {
    if (oldest === null || follow.seen_through < oldest) oldest = follow.seen_through;
  }
  return oldest;
}

/** The day after `seenThrough` (an ISO day): the first day whose releases are new. */
function firstNewDay(seenThrough: string | null): Date | null {
  const day = calendarDay(seenThrough);
  if (!(day instanceof Date) || Number.isNaN(day.getTime())) return null;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
}

export interface FollowStatusInput {
  /** New tracks you do not own: `follows().new_count`, or the picked follow's own. */
  newCount: number;
  /** The day the follow (or the oldest of them) was seen through. */
  seenThrough: string | null;
  /**
   * When it was marked seen, if ever. A follow that was looked at is new "since you last looked":
   * the look's day is not a day whose releases are all new, only those found after it.
   */
  seenAt?: string | null;
  /** Whether Hide owned is on. */
  hiding: boolean;
}

/**
 * The status line as two parts, so the count can be bold: "14 new tracks" and the rest
 * (" since Nov 7 · checked 2 min ago · 3 you own hidden"). The count never changes with the owned
 * filter; the owned tracks are said after it, hidden or shown.
 */
export function followStatusParts(
  feed: Pick<FollowFeed, "total" | "hidden_owned" | "checked_at">,
  input: FollowStatusInput,
  now: Date = new Date(),
): { count: string; rest: string } {
  const first = firstNewDay(input.seenThrough);
  const since = input.seenAt
    ? " since you last looked"
    : first
      ? ` since ${formatDayInSentence(first, { now })}`
      : "";
  const ago = checkedAgo(feed.checked_at, now);
  const parts = [ago === "not checked yet" ? ago : `checked ${ago}`];
  if (input.hiding) {
    if (feed.hidden_owned > 0) parts.push(`${formatCount(feed.hidden_owned)} you own hidden`);
  } else {
    const shown = Math.max(0, feed.total - input.newCount);
    if (shown > 0) parts.push(`${formatCount(shown)} you own shown`);
  }
  return { count: countNoun(input.newCount, "new track"), rest: `${since} · ${parts.join(" · ")}` };
}

/** "14 new tracks since Nov 7 · checked 2 min ago · 3 you own hidden". */
export function followStatusLine(
  feed: Pick<FollowFeed, "total" | "hidden_owned" | "checked_at">,
  input: FollowStatusInput,
  now: Date = new Date(),
): string {
  const { count, rest } = followStatusParts(feed, input, now);
  return `${count}${rest}`;
}

/** The count chip beside a name or the tab: "4" reads as "4 new" in words for a screen reader. */
export function newCountWords(count: number): string {
  return `${formatCount(count)} new`;
}

/** A follow's key, for selecting it and for a React key. */
export function followKey(follow: { kind: string; beatport_id: number }): string {
  return `${follow.kind}:${follow.beatport_id}`;
}
