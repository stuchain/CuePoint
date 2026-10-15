/** The one mark for a value that is not there. */
export const MISSING_VALUE = "—";

/** One muted dash: no "-", no blank, no "unrated" ("unrated" is only a filter's word). */
export function MissingValue({ className = "" }: { className?: string }) {
  return <span className={`cp-missing ${className}`.trim()}>{MISSING_VALUE}</span>;
}

/** The value, or the muted dash when it is empty (null, undefined, "" or only spaces). */
export function valueOrMissing(value: string | number | null | undefined) {
  if (value === null || value === undefined) return <MissingValue />;
  if (typeof value === "string" && value.trim() === "") return <MissingValue />;
  return value;
}
