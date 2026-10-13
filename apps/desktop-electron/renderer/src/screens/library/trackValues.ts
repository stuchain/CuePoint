/**
 * A track's values as the Library draws them (LIBUI-10, CLEAN-05).
 *
 * Kept apart from the column declarations so the Clean helpers that read the
 * same values can use them without importing the columns that use the helpers.
 */

/** Minutes and seconds, the way a deck shows a track length. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

/** The shared BPM format, re-exported so the table's importers stay put. */
export { formatBpm } from "../../components/format/bpm";

/**
 * The value a user sees for a field CuePoint can override (DEC-068).
 *
 * `resolved` is what the engine resolved; it is absent only from rows built
 * before CLEAN-05, where the imported value is all there is. A resolved null
 * means neither layer has a value, and is kept rather than falling back.
 */
export function effective<T>(resolved: T | null | undefined, imported: T | null): T | null {
  return resolved === undefined ? imported : resolved;
}
