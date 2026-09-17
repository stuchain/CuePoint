/**
 * What the "Write tags to files" dialog says, as pure functions (CLEAN-13, DEC-070).
 *
 * Writing into a person's files is the one thing in Phase 7 that leaves the
 * database, so the dialog's words carry the design: what will be written, what
 * will be skipped and why, and that nothing is written until a preview has
 * answered. The engine counts; this names what it counted.
 */
import type {
  TagRestoreResult,
  TagWriteOptions,
  TagWritePreview,
  TagWriteResult,
} from "../../api/cuepointBridge.types";

/** The fields a write can write, in the order the dialog offers them. */
export const TAG_FIELDS = [
  { toggle: "write_key", field: "key", label: "Key" },
  { toggle: "write_bpm", field: "bpm", label: "BPM" },
  { toggle: "write_year", field: "year", label: "Year" },
  { toggle: "write_genre", field: "genre", label: "Genre" },
  { toggle: "write_label", field: "label", label: "Label" },
  { toggle: "write_comment", field: "comment", label: "Comment" },
] as const;

export type TagToggle = (typeof TAG_FIELDS)[number]["toggle"];

/** Every option the dialog sends, always all of them. */
export type DialogTagOptions = Required<TagWriteOptions>;

/**
 * What the dialog opens on.
 *
 * Sent in full, so what is written never depends on a default the dialog did
 * not show. The comment starts **off**: the engine's inherited default writes
 * "ok" over a file's comment, which is a person's to choose (DEC-070).
 */
export const DEFAULT_TAG_OPTIONS: DialogTagOptions = {
  key_format: "normal",
  write_key: true,
  write_bpm: false,
  write_year: true,
  write_genre: false,
  write_label: true,
  write_comment: false,
  comment_text: "ok",
  embed_missing_artwork: false,
};

export const KEY_FORMATS: ReadonlyArray<{ value: DialogTagOptions["key_format"]; label: string }> = [
  { value: "normal", label: "As Rekordbox writes it (Am, C#)" },
  { value: "camelot", label: "Camelot (8A, 12B)" },
  { value: "short", label: "Short (Amin, Gmaj)" },
];

/** Why the options cannot be previewed, or null when they can. */
export function optionsProblem(options: DialogTagOptions): string | null {
  const anything = TAG_FIELDS.some(({ toggle }) => options[toggle]) || options.embed_missing_artwork;
  if (!anything) return "Choose at least one field to write, or artwork to add.";
  if (options.write_comment && options.comment_text.trim() === "") {
    return "Give the comment some text, or leave the comment out.";
  }
  if (options.comment_text.length > 255) return "A comment can be at most 255 characters.";
  return null;
}

function count(number: number, noun: string): string {
  return `${number.toLocaleString()} ${noun}${number === 1 ? "" : "s"}`;
}

/** Why a whole file is skipped, in words (CLEAN-10's reasons). */
export function fileSkipText(reason: string): string {
  switch (reason) {
    case "wav":
      return "WAV files, whose tags Rekordbox does not read back";
    case "unsupported_format":
      return "formats CuePoint does not write (only MP3, AIFF, FLAC and Ogg Vorbis)";
    case "not_checked":
      return "files not checked at their current path — check files first";
    case "missing":
      return "files that are missing";
    case "unreadable":
      return "files that cannot be read";
    case "tags_unreadable":
      return "files whose tags cannot be read";
    case "nothing_to_write":
      return "files that already hold these values";
    case "changed_since_preview":
      return "files that changed since the preview";
    case "vanished":
      return "files that disappeared while writing";
    default:
      return reason.replace(/_/g, " ");
  }
}

/** A field's name in a sentence, artwork included. */
export function fieldName(field: string): string {
  if (field === "artwork") return "Artwork";
  return TAG_FIELDS.find((entry) => entry.field === field)?.label ?? field;
}

/** Why one field of a file is left alone, in words. */
export function fieldSkipText(reason: string): string {
  switch (reason) {
    case "no_value":
      return "no value to write";
    case "unchanged":
      return "already the same";
    case "key_unrecognized":
      return "not a key CuePoint can write";
    case "has_artwork":
      return "the file already has a picture";
    case "no_beatport_artwork":
      return "no accepted Beatport match with artwork";
    case "artwork_unavailable":
      return "Beatport's picture could not be used";
    default:
      return reason.replace(/_/g, " ");
  }
}

/** One line per skip reason, most files first. */
export function skippedLines(skipped: Record<string, { count: number } | number>): string[] {
  return Object.entries(skipped)
    .map(([reason, value]) => [reason, typeof value === "number" ? value : value.count] as const)
    .filter(([, number]) => number > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, number]) => `${count(number, "file")} skipped: ${fileSkipText(reason)}`);
}

/** What each field will be written into, as lines. */
export function fieldLines(fields: Record<string, number>): string[] {
  return Object.entries(fields)
    .filter(([, number]) => number > 0)
    .map(([field, number]) => `${fieldName(field)}: ${count(number, "file")}`);
}

/** The sentence over a preview: what a write would do, and that nothing happened yet. */
export function previewHeadline(preview: TagWritePreview): string {
  if (preview.cancelled) return "The preview was stopped before it read every file. Preview again.";
  if (preview.files === 0) {
    return `Nothing to write: none of the ${count(preview.total, "file")} would change.`;
  }
  return `Writing would change ${count(preview.files, "file")} of ${preview.total.toLocaleString()}. Nothing has been written yet.`;
}

/** Whether Write is offered: a preview answered, uncancelled, with files to change. */
export function canWrite(preview: TagWritePreview | null): boolean {
  return preview != null && !preview.cancelled && preview.files > 0;
}

/** What a finished write says. Failures are counted, never folded into "written". */
export function writeHeadline(result: TagWriteResult): string {
  const parts = [`Wrote ${count(result.written, "file")}`];
  if (result.failed > 0) parts.push(`${result.failed.toLocaleString()} could not be written`);
  const skipped = Object.values(result.skipped).reduce((sum, value) => sum + value, 0);
  if (skipped > 0) parts.push(`${skipped.toLocaleString()} skipped`);
  const line = `${parts.join(", ")}.`;
  return result.cancelled ? `Stopped early. ${line}` : line;
}

/** What a finished restore says. */
export function restoreHeadline(result: TagRestoreResult): string {
  const parts = [`Restored ${count(result.files, "file")}`];
  if (result.already > 0) parts.push(`${count(result.already, "value")} already back`);
  if (result.skipped > 0) {
    parts.push(`${count(result.skipped, "value")} left alone because the file changed since`);
  }
  if (result.failed > 0) parts.push(`${result.failed.toLocaleString()} could not be restored`);
  const line = `${parts.join(", ")}.`;
  return result.cancelled ? `Stopped early. ${line}` : line;
}

/** The reminder a write always ends with: Rekordbox reads tags only when told to. */
export const RELOAD_TAG_REMINDER =
  "Rekordbox keeps showing the old values until it re-reads these files: select them in Rekordbox and choose Reload Tag.";
