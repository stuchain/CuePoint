/**
 * How a count is written on the Statistics page: the shared `format/counts` helpers, re-exported
 * so a bar, its screen-reader table, a panel's line and the key summary never disagree (C169).
 */
import { countNoun } from "../../format/counts";

export { formatCount } from "../../format/counts";

/** "1 track", "312 tracks". */
export function tracksText(count: number): string {
  return countNoun(count, "track");
}
