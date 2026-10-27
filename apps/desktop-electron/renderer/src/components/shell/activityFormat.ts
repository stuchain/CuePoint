import type { ActivityEvent } from "../../api/cuepointBridge.types";
import { formatCount } from "../../format/counts";
import { formatDay, formatTimeOfDay } from "../../format/dates";

/**
 * Presentation rules for the activity feed, as pure functions.
 *
 * Timestamps and detail rendering are where a feed quietly goes wrong — an
 * unparseable date becoming "Invalid Date", a detail object printed as
 * "[object Object]" — so they are tested directly rather than through the
 * panel.
 */

/**
 * The time of day, written as the rest of the app writes it ("4:58 PM", no leading zero).
 *
 * The date is the day heading's (`formatDayHeading`), so a row carries only the
 * time. The engine stores ISO-8601 UTC. Anything unparseable is shown verbatim:
 * the raw value is more useful than "Invalid Date", and it says what actually
 * happened rather than hiding it.
 */
export function formatEventTime(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return formatTimeOfDay(when);
}

/** The day as a heading: "Today", "Yesterday", "Oct 3", or "Dec 31, 2025" from another year (C170). */
export function formatDayHeading(iso: string, now: Date = new Date()): string {
  // The app's one date writer, in the computer's own order; an unreadable value is shown as it is.
  return formatDay(iso, { now }) || iso;
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
  "library.batch_reverted": "Undo",
  "track_field_changed": "Edit",
  "track_field_reverted": "Undo",
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
  "clean.tags.written": "Synced to files",
  "clean.tags.restored": "Sync undone",
  "clean.tags.interrupted": "Sync stopped",
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

/** The event types that stopped part-way or could not reach their files: a warning, not news. */
const WARNING_EVENTS: ReadonlySet<string> = new Set([
  "clean.match.interrupted",
  "clean.files.unreachable",
  "clean.tags.interrupted",
]);

/**
 * The tone of an event's category chip (item 8): the tinted status chip, as "Done" is, never the
 * grey neutral box that reads as a button. A category is information; one that stopped or could
 * not reach its folder is a warning.
 */
export function formatEventTone(type: string): "info" | "warning" {
  return WARNING_EVENTS.has(type) ? "warning" : "info";
}

/** The badge word for an event type, or "" when there is none (the summary stands alone). */
export function formatEventType(type: string): string {
  return Object.hasOwn(EVENT_WORDS, type) ? EVENT_WORDS[type]! : "";
}

/**
 * The detail keys worth a line of their own, and what each is called (STR-7).
 *
 * Counts, names and files: what a person would say about the event. Everything
 * else (ports, ids, paths, triggers, timings) stays in the log.
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
  written: "Saved",
  restored: "Undone",
  missing: "Missing",
  playlist: "Playlist",
  playlist_name: "Playlist",
  collection_name: "Collection",
  smart_collection_name: "Smart Collection",
  file: "File",
  file_name: "File",
};

/**
 * A one-line rendering of an event's meaningful detail, or "" when there is none.
 *
 * Skipped: zero, any boolean (true/false is never plain words), and a number the
 * summary already says ("Imported 120 tracks" needs no "Tracks: 120").
 */
export function formatEventDetail(
  detail: Record<string, unknown> | undefined,
  summary = "",
): string {
  if (!detail) return "";
  const shown: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    const label = Object.hasOwn(DETAIL_LABELS, key) ? DETAIL_LABELS[key] : undefined;
    if (!label || value === null || value === "" || typeof value === "boolean") continue;
    if (typeof value === "number" && (value === 0 || summaryHasNumber(summary, value))) continue;
    const text = formatDetailValue(value);
    if (text) shown.push(`${label}: ${text}`);
  }
  return shown.join(" · ");
}

/** The number with commas every three digits: how the engine writes a count into a summary. */
function groupedDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Whether the summary already prints this number, grouped ("1,200") or plain ("1200"). */
function summaryHasNumber(summary: string, value: number): boolean {
  const forms = [formatCount(value), groupedDigits(value), String(value)];
  // Not a digit run inside a version ("v1.0.0") or a word, and "3," is 3, not "3,5".
  const printed = summary.match(/(?<![\d.\w])(?:\d{1,3}(?:,\d{3})+|\d+)(?![\d.,]\d)(?!\w)/g);
  return (printed ?? []).some((text) => forms.includes(text));
}

/** "1 field", not "1 fields" — visible in the panel on any single-key detail. */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function formatDetailValue(value: unknown): string {
  if (typeof value === "number") return formatCount(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return count(value.length, "item");
  // Objects would otherwise stringify to "[object Object]", which tells the
  // reader nothing at all.
  if (value && typeof value === "object") return count(Object.keys(value).length, "field");
  return "";
}

/**
 * The summary as the feed shows it. A dig's summary is recorded as "Discovery found 6 tracks in 1
 * chart…"; the app calls the action a dig (M398), so the old entries read the same as new ones.
 */
export function formatEventSummary(type: string, summary: string): string {
  return type === "discovery.ran" ? summary.replace(/^Discovery\b/, "Dig") : summary;
}

/**
 * The family an event belongs to, for the feed's filter (M269): what a person would call the part
 * of the app it came from. A type with no family is listed under "Other".
 */
export function formatEventFamily(type: string): string {
  if (type.startsWith("clean.")) return "Clean";
  if (type.startsWith("discover")) return "Discover";
  if (type.startsWith("waveforms.")) return "Waveforms";
  if (type.startsWith("library.") || type.startsWith("track_field_")) return "Library";
  if (type.startsWith("collection.") || type.startsWith("set.") || type.startsWith("set_list.")) {
    return "Collections and Sets";
  }
  if (type.startsWith("rekordbox.")) return "Export";
  if (type.startsWith("engine.") || type.startsWith("backup.")) return "App";
  return "Other";
}

/** The families the filter offers, in the order it lists them. */
export const EVENT_FAMILIES: readonly string[] = [
  "Library",
  "Clean",
  "Discover",
  "Collections and Sets",
  "Export",
  "Waveforms",
  "App",
  "Other",
];

/** Sorts newest first, tolerating events the engine returned out of order. */
export function sortNewestFirst(events: ActivityEvent[]): ActivityEvent[] {
  return [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
