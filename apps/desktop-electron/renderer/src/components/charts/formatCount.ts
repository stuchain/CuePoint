/**
 * How a count is written on the Statistics page (DEC-158: American spelling and grouping), so
 * a bar, its screen-reader table, a panel's line and the key summary never disagree.
 */
export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

/** "1 track", "312 tracks". */
export function tracksText(count: number): string {
  return `${formatCount(count)} ${count === 1 ? "track" : "tracks"}`;
}
