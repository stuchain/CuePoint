/**
 * What the save window says after a write or a restore, and how a skip is named, as pure functions (CLEAN-13, DEC-070).
 *
 * Writing into a person's files is the one thing in Phase 7 that leaves the
 * database, so the dialog's words carry the design: what will be written, what
 * will be skipped and why, and that nothing is written until a preview has
 * answered. The engine counts; this names what it counted.
 */
import { countNoun, formatCount } from "../../format/counts";
import type {
  TagRestoreResult,
  TagWriteOptions,
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

/** Every option a save sends, always all of them. */
export type DialogTagOptions = Required<TagWriteOptions>;

export const KEY_FORMATS: ReadonlyArray<{ value: DialogTagOptions["key_format"]; label: string }> = [
  { value: "normal", label: "Rekordbox's own (Am, C#)" },
  { value: "camelot", label: "Camelot (8A, 12B)" },
  { value: "short", label: "Short (Amin, Gmaj)" },
];

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
      return "nothing to save";
    case "unchanged":
      return "already the same";
    case "file_has_value":
      return "the file already has a value";
    case "key_unrecognized":
      return "not a key CuePoint can write";
    case "has_artwork":
      return "the file already has a picture";
    case "no_beatport_artwork":
      return "no confirmed Beatport match with artwork";
    case "artwork_unavailable":
      return "Beatport's picture could not be used";
    default:
      return reason.replace(/_/g, " ");
  }
}

/** What a finished write says. Failures are counted, never folded into "written". */
export function writeHeadline(result: TagWriteResult): string {
  const parts = [`Synced ${countNoun(result.written, "file")}`];
  if (result.failed > 0) parts.push(`${formatCount(result.failed)} could not be synced`);
  const skipped = Object.values(result.skipped).reduce((sum, value) => sum + value, 0);
  if (skipped > 0) parts.push(`${formatCount(skipped)} skipped`);
  const line = `${parts.join(", ")}.`;
  return result.cancelled ? `Stopped early. ${line}` : line;
}

/** What a finished restore says. */
export function restoreHeadline(result: TagRestoreResult): string {
  const parts = [`Undid ${countNoun(result.files, "file")}`];
  if (result.already > 0) parts.push(`${countNoun(result.already, "value")} already back`);
  if (result.skipped > 0) {
    parts.push(`${countNoun(result.skipped, "value")} left alone because the file changed since`);
  }
  if (result.failed > 0) parts.push(`${formatCount(result.failed)} could not be undone`);
  const line = `${parts.join(", ")}.`;
  return result.cancelled ? `Stopped early. ${line}` : line;
}

/** The reminder a write always ends with: Rekordbox reads tags only when told to. */
export const RELOAD_TAG_REMINDER =
  "Rekordbox keeps showing the old values until it re-reads these files: select them in Rekordbox and choose Reload Tag.";
