/**
 * Reading the Keys page's counts (PAGES-16).
 *
 * The engine answers `{code, count}` per key in Camelot order; these are the small
 * pure things the page and the wheel do with that answer, so the numbers written on a
 * wedge, in the list and in a key's name are one set of words.
 */
import type { KeyPopulationEntry } from "../../api/cuepointBridge.types";

/** The counts by Camelot code. A key that is not in the map holds no tracks. */
export function countsByCode(keys: readonly KeyPopulationEntry[]): Map<string, number> {
  return new Map(keys.map((entry) => [entry.code, entry.count]));
}

/**
 * A count's bar as a percent of the biggest, whole. Any count above zero is at least 1, so a
 * key with a few tracks beside a key with thousands still shows a bar.
 */
export function barPercent(count: number, biggest: number): number {
  if (count <= 0 || biggest <= 0) return 0;
  return Math.max(1, Math.round((count / biggest) * 100));
}

/** One line of the counts list: a key, or the tracks with no key. */
export interface KeysListRow {
  kind: "key" | "none";
  /** The Camelot code; null for the no-key row, which is drawn as a dash. */
  code: string | null;
  count: number;
  /** The bar, as a whole percent of the biggest count in the list. */
  percent: number;
}

/**
 * The list's rows in Camelot order, then "— no key" as one more row (C258), so it is clickable
 * and drawn like the others. Every bar is measured against the biggest count among all of them.
 */
export function keysListRows(keys: readonly KeyPopulationEntry[], noKey: number): KeysListRow[] {
  const biggest = Math.max(0, noKey, ...keys.map((entry) => entry.count));
  return [
    ...keys.map(
      (entry): KeysListRow => ({
        kind: "key",
        code: entry.code,
        count: entry.count,
        percent: barPercent(entry.count, biggest),
      }),
    ),
    { kind: "none", code: null, count: noKey, percent: barPercent(noKey, biggest) },
  ];
}
