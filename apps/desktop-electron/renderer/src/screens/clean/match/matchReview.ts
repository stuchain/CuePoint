/**
 * The words of reviewing one search (C22): the header over the card and the
 * screen after the last track.
 *
 * Pure, as `playlistStatus.ts` is. Review N › opens One at a time on one run, only
 * the tracks to check; the ones already confirmed are done, and
 * nothing is written to the files until Save.
 */

/** What a review is about: the playlist (or "Whole library"), and how many were already confirmed. */
export interface ReviewTarget {
  name: string;
  /** The playlist's id; null for the whole library. */
  playlistId: number | null;
  /** Tracks already confirmed: the run's `found` when reviewing a run, else the playlist's accepted. */
  sure: number;
  /** Whether the review is of one run (From: one run) rather than the playlist. */
  fromRun: boolean;
}

/** "2 of 9 · 15 already confirmed": the confirmed ones are what the run (or the playlist) had settled. */
export function reviewHeaderWords(position: number, total: number, confirmed: number): string {
  const place = `${position.toLocaleString()} of ${total.toLocaleString()}`;
  if (confirmed <= 0) return place;
  return `${place} · ${confirmed.toLocaleString()} already confirmed`;
}

/**
 * The done screen's two lines: "hJ is done" and "22 confirmed · 2 not confirmed".
 * "Not confirmed" is every track of the playlist without an accepted match: not matched, no match,
 * rejected, still waiting or skipped. `skipped` is said on its own when the review ended on them.
 */
export function reviewDoneWords(
  name: string,
  counts: { track_count: number; accepted: number },
  skipped = 0,
): { headline: string; detail: string } {
  const left = Math.max(0, counts.track_count - counts.accepted);
  const parts = [`${counts.accepted.toLocaleString()} confirmed`];
  if (left > 0) parts.push(`${left.toLocaleString()} not confirmed`);
  if (skipped > 0) parts.push(`${skipped.toLocaleString()} skipped`);
  return { headline: `${name} is done`, detail: parts.join(" · ") };
}
