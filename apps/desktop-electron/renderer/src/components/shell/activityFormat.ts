import type { ActivityEvent } from "../../api/cuepointBridge.types";

/**
 * Presentation rules for the activity feed, as pure functions.
 *
 * Timestamps and detail rendering are where a feed quietly goes wrong — an
 * unparseable date becoming "Invalid Date", a detail object printed as
 * "[object Object]" — so they are tested directly rather than through the
 * panel.
 */

/**
 * A timestamp a person can read, in their own locale.
 *
 * The engine stores ISO-8601 UTC. Anything unparseable is shown verbatim: the
 * raw value is more useful than "Invalid Date", and it says what actually
 * happened rather than hiding it.
 */
export function formatEventTime(iso: string, now: Date = new Date()): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;

  const sameDay = when.toDateString() === now.toDateString();
  const time = when.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameDay) return time;

  return `${when.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`;
}

/**
 * The event type as a label.
 *
 * Types are dotted identifiers like `library.import`. Splitting on the dot and
 * showing the last part keeps the column narrow without inventing a mapping
 * table that every new event type would have to be added to.
 */
export function formatEventType(type: string): string {
  const parts = type.split(".").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : type;
}

/** A one-line rendering of an event's detail, or "" when there is nothing. */
export function formatEventDetail(detail: Record<string, unknown> | undefined): string {
  if (!detail) return "";
  const entries = Object.entries(detail).filter(([, value]) => value !== null && value !== "");
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => `${key}: ${formatDetailValue(value)}`)
    .join(" · ");
}

/** "1 field", not "1 fields" — visible in the panel on any single-key detail. */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function formatDetailValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return count(value.length, "item");
  // Objects would otherwise stringify to "[object Object]", which tells the
  // reader nothing at all.
  if (value && typeof value === "object") return count(Object.keys(value).length, "field");
  return "";
}

/** Sorts newest first, tolerating events the engine returned out of order. */
export function sortNewestFirst(events: ActivityEvent[]): ActivityEvent[] {
  return [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
