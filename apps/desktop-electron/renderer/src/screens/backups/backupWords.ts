/**
 * Backups in words (HARDEN-01, DEC-155, DEC-158): the reason a copy was made, when it was made,
 * and what is running when a restore has to wait. The page says "library" and "backup", never
 * "database" or "engine".
 */
import type { BackupEntry } from "../../api/cuepointBridge.types";
import { formatCount } from "../../format/counts";
import { formatDay, formatDayTime, formatDayTimeInSentence, formatTimeOfDay, formatWeekdayMoment, toDate } from "../../format/dates";

/** The part of a backup these words need; a library state's way back has no size or version. */
type Reasoned = Pick<BackupEntry, "reason"> & { toVersion?: string | null };

/** Why a copy was made: "When you opened CuePoint", "You made this", "Before updating to 1.0.0", "Before restoring". */
export function backupReason(entry: Reasoned): string {
  switch (entry.reason) {
    case "launch":
      return "When you opened CuePoint";
    case "manual":
      return "You made this";
    case "pre-upgrade":
      return entry.toVersion ? `Before updating to ${entry.toVersion}` : "Before updating";
    case "pre-restore":
    case "pre-restore-damaged":
      return "Before restoring";
    default:
      return "A backup";
  }
}

/** A row's date: "Today, 1:02 PM", "Yesterday, 9:41 AM", "Oct 27, 10:10 PM". Empty when it cannot be read. */
export function backupWhen(iso: string | null | undefined): string {
  const date = toDate(iso);
  if (!date) return "";
  const day = formatDay(date);
  const time = formatTimeOfDay(date);
  if (day === "Today" || day === "Yesterday") return `${day}, ${time}`;
  return formatDayTime(date);
}

/** The same moment in the middle of a sentence: "today, 9:41 AM", "Oct 27, 10:10 PM". */
export function backupWhenInSentence(iso: string | null | undefined): string {
  return formatDayTimeInSentence(iso);
}

/** "Tuesday, October 27, 10:10 PM": the moment a restore goes back to. */
export function backupMoment(iso: string | null | undefined): string {
  return formatWeekdayMoment(iso);
}

/** Work a restore found running, named for a sentence ("An import is running"). */
const WORK_NOUN: Record<string, string> = {
  library_import: "An import",
  library_refresh_apply: "A refresh",
  library_refresh_preview: "A check for changes",
  library_batch: "A batch edit",
  file_check: "A file check",
  duplicate_scan: "A duplicate scan",
  artwork_scan: "An artwork scan",
  clean_match: "A match on Beatport",
  tag_write: "A sync to files",
  tag_restore: "An undo of a sync",
  rekordbox_export: "An export to Rekordbox",
  waveform_analysis: "Waveform analysis",
  discovery: "A Discover run",
  beatport_playlist: "A Beatport playlist",
  beatport_resolve: "A Beatport link",
};

/** The work that is running, as the noun a sentence starts with. */
export function workNoun(type: string | undefined): string {
  return (type && WORK_NOUN[type]) || "Background work";
}

/** "(312 of 2,400 tracks)" from a job's progress; empty when it has no count. */
export function workProgress(done: number | undefined, total: number | undefined): string {
  if (typeof done !== "number" || typeof total !== "number" || !(total > 0)) return "";
  return `(${formatCount(done)} of ${formatCount(total)} tracks)`;
}

/** "Before updating to 1.0.0" clause for a question: ", before updating to 1.0.0". */
export function restoreClause(entry: Reasoned): string {
  return entry.reason === "pre-upgrade" && entry.toVersion ? `, before updating to ${entry.toVersion}` : "";
}

/** "the import" from "An import"; work with no name of its own is "CuePoint's current work". */
export function workThe(noun: string): string {
  if (noun === "Background work" || noun.startsWith("CuePoint")) return "CuePoint's current work";
  return `the ${noun.replace(/^An? /, "").replace(/^./, (c) => c.toLowerCase())}`;
}
