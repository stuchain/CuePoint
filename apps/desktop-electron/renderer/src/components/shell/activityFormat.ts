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
 * The time of day a person can read, in their own locale.
 *
 * The date is the day heading's (`formatDayHeading`), so a row carries only the
 * time. The engine stores ISO-8601 UTC. Anything unparseable is shown verbatim:
 * the raw value is more useful than "Invalid Date", and it says what actually
 * happened rather than hiding it.
 */
export function formatEventTime(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The day as a heading: "Today", "Yesterday", "Oct 3", or "Dec 31, 2025" from another year. */
export function formatDayHeading(iso: string, now: Date = new Date()): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;

  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((day(now) - day(when)) / 86_400_000);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  // Month first, always: the app is American English (DEC-158), whatever the locale.
  const date = `${MONTHS[when.getMonth()]} ${when.getDate()}`;
  return when.getFullYear() === now.getFullYear() ? date : `${date}, ${when.getFullYear()}`;
}

/** Events under one day heading, in the order given. */
export interface DayGroup {
  heading: string;
  events: ActivityEvent[];
}

/** Groups events (already sorted) under day headings, one group per run of the same day. */
export function groupByDay(events: ActivityEvent[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const heading = formatDayHeading(event.created_at, now);
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.events.push(event);
    else groups.push({ heading, events: [event] });
  }
  return groups;
}

/**
 * Every event type the app records, and the word the badge shows for it (STR-6).
 *
 * Found by grepping `src/cuepoint` for `EVENT_*` constants and `record_activity`
 * calls; activityFormat.test.ts reads the same source, so a new type fails there
 * until it has a word. A type with no word shows no badge: the summary says it.
 */
const EVENT_WORDS: Record<string, string> = {
  "engine.started": "App started",
  "backup.created": "Backup",
  "library.imported": "Import",
  "library.refreshed": "Refresh",
  "library.marks_read": "Cue points",
  "library.batch": "Edit",
  "library.batch_reverted": "Revert",
  "track_field_changed": "Edit",
  "track_field_reverted": "Revert",
  "collection.frozen": "Collection",
  "set.created_from": "Set",
  "set_list.saved": "Set list",
  "rekordbox.exported": "Export",
  "waveforms.analysed": "Waveforms",
  "waveforms.data_deleted": "Waveforms removed",
  "clean.match": "Match",
  "clean.match.interrupted": "Match stopped",
  "clean.files.checked": "Files checked",
  "clean.files.unreachable": "Folder unavailable",
  "clean.duplicates.scanned": "Duplicates",
  "clean.duplicates.dismissed": "Duplicates",
  "clean.duplicates.restored": "Duplicates",
  "clean.artwork.scanned": "Artwork",
  "clean.tags.written": "Tags written",
  "clean.tags.restored": "Tags restored",
  "clean.tags.interrupted": "Tags stopped",
  "discovery.ran": "Discover",
  "discover.beatport.resolved": "Beatport",
  "discover.playlist.pushed": "Beatport playlist",
  "discover.wantlist.added": "Wantlist",
  "discover.wantlist.removed": "Wantlist",
  "discover.wantlist.noted": "Wantlist",
  "discover.wantlist.bought": "Wantlist",
  "discover.wantlist.unbought": "Wantlist",
};

export const RECORDED_EVENT_TYPES: readonly string[] = Object.keys(EVENT_WORDS);

/** The badge word for an event type, or "" when there is none (the summary stands alone). */
export function formatEventType(type: string): string {
  return Object.hasOwn(EVENT_WORDS, type) ? EVENT_WORDS[type]! : "";
}

/**
 * The detail keys worth a line of their own, and what each is called (STR-7).
 *
 * Counts, names and files: what a person would say about the event. Everything
 * else (ports, ids, paths, triggers, timings) is behind the row's Details.
 */
const DETAIL_LABELS: Record<string, string> = {
  tracks: "Tracks",
  track_count: "Tracks",
  playlists: "Playlists",
  inserted: "Added",
  added: "Added",
  updated: "Updated",
  removed: "Removed",
  deleted: "Deleted",
  skipped: "Skipped",
  failed: "Failed",
  written: "Written",
  restored: "Restored",
  missing: "Missing",
  playlist: "Playlist",
  playlist_name: "Playlist",
  set_name: "Set",
  collection_name: "Collection",
  smart_collection_name: "Smart Collection",
  file: "File",
  file_name: "File",
};

/** A one-line rendering of an event's meaningful detail, or "" when there is none. */
export function formatEventDetail(detail: Record<string, unknown> | undefined): string {
  if (!detail) return "";
  const shown: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    const label = Object.hasOwn(DETAIL_LABELS, key) ? DETAIL_LABELS[key] : undefined;
    if (!label || value === null || value === "") continue;
    const text = formatDetailValue(value);
    if (text) shown.push(`${label}: ${text}`);
  }
  return shown.join(" · ");
}

/** Everything `formatEventDetail` left out, as raw "key: value" lines for the Details disclosure. */
export function formatEventExtras(detail: Record<string, unknown> | undefined): string[] {
  if (!detail) return [];
  return Object.entries(detail)
    .filter(([key, value]) => !Object.hasOwn(DETAIL_LABELS, key) && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${formatDetailValue(value, true)}`);
}

/** "1 field", not "1 fields" — visible in the panel on any single-key detail. */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function formatDetailValue(value: unknown, raw = false): string {
  if (typeof value === "number") return raw ? String(value) : value.toLocaleString("en-US");
  if (typeof value === "string" || typeof value === "boolean") return String(value);
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
