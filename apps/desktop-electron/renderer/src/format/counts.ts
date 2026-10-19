/**
 * The one way a count is written (consistency area 15): grouped the way the computer's
 * locale groups digits, never forced to American grouping.
 */

/** "1,234" on an American computer, "1.234" on a German one. */
export function formatCount(count: number, locale?: string): string {
  return count.toLocaleString(locale);
}

/**
 * The noun for a count: "track" for 1, "tracks" otherwise. Pass `many` for an irregular
 * plural ("entry", "entries").
 */
export function pluralWord(count: number, one: string, many: string = `${one}s`): string {
  return count === 1 ? one : many;
}

/**
 * The one plural helper (C169): the grouped count and its noun, "1 track", "2 tracks",
 * "1,234 tracks". Pass `many` for an irregular plural ("entry", "entries"). Screens never write
 * their own `plural*` function.
 */
export function countNoun(count: number, noun: string, many?: string, locale?: string): string {
  return `${formatCount(count, locale)} ${pluralWord(count, noun, many)}`;
}

/** "1 track", "2 tracks", "1,234 tracks" (the same as `countNoun`). */
export function plural(count: number, one: string, many?: string, locale?: string): string {
  return countNoun(count, one, many, locale);
}
