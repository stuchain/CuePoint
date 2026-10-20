/**
 * The one way a day or a time is written (consistency area 15), in the computer's own
 * locale and clock: "Oct 15, 2026", "Oct 15" in the current year, "Today", "Yesterday",
 * "Oct 15, 5:35 PM" (or "17:35" on a 24-hour computer). ISO text belongs in file names only.
 *
 * Every function takes a date, an ISO string or a timestamp, and an optional `now` and
 * `locale` so tests do not depend on the clock or the machine. Anything that is not a date
 * comes back as an empty string; callers that want to show the raw value check for that.
 */

export type DateInput = Date | string | number | null | undefined;

export interface DateOptions {
  /** The moment "this year", "Today" and "Yesterday" are measured from. */
  now?: Date;
  /** A BCP 47 tag; the computer's locale when left out. */
  locale?: string;
}

/** A date as a Date, or null when it is missing or not a date. */
export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formatters write a narrow no-break space before "PM"; a plain space reads and tests alike. */
function plain(text: string): string {
  return text.replace(/[\u202f\u00a0]/g, " ");
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole calendar days from `date` to `now`: 0 today, 1 yesterday, negative in the future. */
export function daysAgo(date: Date, now: Date = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
}

function dayText(date: Date, now: Date, locale: string | undefined, withYear?: boolean): string {
  const year = withYear ?? date.getFullYear() !== now.getFullYear();
  return plain(
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      ...(year ? { year: "numeric" } : {}),
    }).format(date),
  );
}

/** "Today", "Yesterday", "Oct 15" this year, "Oct 15, 2025" any other year. */
export function formatDay(value: DateInput, options: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return "";
  const now = options.now ?? new Date();
  const ago = daysAgo(date, now);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  return dayText(date, now, options.locale);
}

/** `formatDay` for the middle of a sentence: "today", "yesterday", otherwise the date ("Oct 15"). */
export function formatDayInSentence(value: DateInput, options: DateOptions = {}): string {
  const text = formatDay(value, options);
  return text === "Today" || text === "Yesterday" ? text.toLowerCase() : text;
}

/**
 * "today, 8:28 AM", "yesterday, 9:05 AM", "Oct 15, 4:42 PM": a moment in the middle of a sentence
 * ("Checked …", "Artwork last read …"). Empty when the time cannot be read.
 */
export function formatDayTimeInSentence(value: DateInput, options: DateOptions = {}): string {
  const day = formatDayInSentence(value, options);
  const time = formatTimeOfDay(value, options);
  return day && time ? `${day}, ${time}` : "";
}

/** The day a track was added to the library (the Added column): the same words as `formatDay`. */
export function formatAdded(value: DateInput, options: DateOptions = {}): string {
  return formatDay(value, options);
}

/** "Oct 15, 2026, 5:35 PM": the whole date and the time, in the locale's own order (never forced to US). */
export function formatDateTime(value: DateInput, options: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return "";
  return plain(
    new Intl.DateTimeFormat(options.locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date),
  );
}

/** "Oct 15, 2026": an absolute day for a name or a file (never "Today"); the year is left off only when `year: false`. */
export function formatDate(value: DateInput, options: DateOptions & { year?: boolean } = {}): string {
  const date = toDate(value);
  if (!date) return "";
  return dayText(date, options.now ?? new Date(), options.locale, options.year ?? true);
}

/** "Oct 15, 5:35 PM": the day (never "Today") and the time on the computer's clock. */
export function formatDayTime(value: DateInput, options: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return "";
  const now = options.now ?? new Date();
  return plain(
    new Intl.DateTimeFormat(options.locale, {
      month: "short",
      day: "numeric",
      ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
      hour: "numeric",
      minute: "2-digit",
    }).format(date),
  );
}

/** Just the time of day on the computer's clock: "5:35 PM" or "17:35". */
export function formatTimeOfDay(value: DateInput, options: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return "";
  return plain(
    new Intl.DateTimeFormat(options.locale, { hour: "numeric", minute: "2-digit" }).format(date),
  );
}

/** "Sep 15 – Oct 15"; both ends carry the year when either is not this year. */
export function formatRange(from: DateInput, to: DateInput, options: DateOptions = {}): string {
  const start = toDate(from);
  const end = toDate(to);
  if (!start || !end) return "";
  const now = options.now ?? new Date();
  const year = start.getFullYear() !== now.getFullYear() || end.getFullYear() !== now.getFullYear();
  return `${dayText(start, now, options.locale, year)} – ${dayText(end, now, options.locale, year)}`;
}

/** A chart's time axis label: "May 2019". */
export function formatChartAxis(value: DateInput, options: DateOptions = {}): string {
  const date = toDate(value);
  if (!date) return "";
  return plain(
    new Intl.DateTimeFormat(options.locale, { month: "short", year: "numeric" }).format(date),
  );
}
