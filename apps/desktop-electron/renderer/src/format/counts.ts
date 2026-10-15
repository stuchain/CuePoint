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

/** "1 track", "2 tracks", "1,234 tracks". */
export function plural(count: number, one: string, many?: string, locale?: string): string {
  return `${formatCount(count, locale)} ${pluralWord(count, one, many)}`;
}
