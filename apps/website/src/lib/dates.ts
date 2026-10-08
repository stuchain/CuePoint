/** "June 24, 2026" from a YYYY-MM-DD string or a Date, always in UTC so the page does not depend on the build machine's zone. */
export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** YYYY-MM-DD for a `<time datetime>` attribute. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
