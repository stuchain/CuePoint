/**
 * What the save window remembers, sends and says, as pure functions (G4 step 4, DEC-262).
 *
 * The window asks for one preview with every field on, and every count in it comes
 * from that preview's `field_choices`: a tick, the Keep choice or the key style
 * changes a number here without another call. Only the footer total, a union of
 * files, is asked of the engine.
 */
import type {
  FieldChoiceCounts,
  TagFieldChoices,
  TagWritePreview,
} from "../../api/cuepointBridge.types";
import { countNoun } from "../../format/counts";
import { SYNC } from "../../format/words";
import { fieldName, fileSkipText, type DialogTagOptions } from "./tagWriting";

/** The rows of the window, in the order it lists them. */
export const SAVE_FIELDS = [
  { id: "key", label: "Key" },
  { id: "genre", label: "Genre" },
  { id: "label", label: "Label" },
  { id: "year", label: "Year" },
  { id: "bpm", label: "BPM" },
  { id: "artwork", label: "Artwork" },
] as const;

/**
 * The rows of the Sync window, in the order it lists them. Artwork is not one: Sync is about the
 * values a match found, and the field choice lives only there. Comment is the one row that is not
 * a match's value: it writes the text the person types into the file's comment tag.
 */
export const SYNC_FIELDS = [
  { id: "bpm", label: "BPM" },
  { id: "genre", label: "Genre" },
  { id: "label", label: "Label" },
  { id: "year", label: "Year" },
  { id: "key", label: "Key" },
  { id: "comment", label: "Comment" },
] as const;

/** The comment is only a row of the Sync window: its text is the person's own, never a Beatport value. */
export type SaveFieldId = (typeof SAVE_FIELDS)[number]["id"] | "comment";
/** Which window the choices are for: saving unsaved values (the Library), or syncing a playlist's matches. */
export type SaveVariant = "save" | "sync";
export type KeyStyle = DialogTagOptions["key_format"];

/** The key styles the window offers, each shown by an example. */
export const KEY_STYLES: ReadonlyArray<{ value: KeyStyle; label: string }> = [
  { value: "normal", label: "Am" },
  { value: "camelot", label: "8A" },
  { value: "short", label: "Amin" },
];

/** What the comment says when the person has not changed it. */
export const DEFAULT_COMMENT = "ok";
/** The engine refuses a longer comment (`MAX_COMMENT_LENGTH`). */
export const MAX_COMMENT_LENGTH = 255;

/** A comment as the file may hold it: one line, no control characters, within the cap (the engine cleans the same way). */
export function cleanComment(text: string): string {
  let clean = "";
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code === 0x2028 || code === 0x2029 || (code >= 9 && code <= 13)) clean += " ";
    else if (code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f)) clean += char;
  }
  // By code points, as the engine counts: a surrogate pair is never cut in half.
  return Array.from(clean).slice(0, MAX_COMMENT_LENGTH).join("");
}

export interface SaveChoices {
  fields: Record<SaveFieldId, boolean>;
  key_format: KeyStyle;
  keep_existing: boolean;
  /** The text of the Comment row (Sync only); what is sent is `commentText(choices)`. */
  comment_text: string;
}

/** The comment that is sent: cleaned and trimmed, or "ok" when nothing is left of it. */
export function commentText(choices: SaveChoices): string {
  return cleanComment(choices.comment_text).trim() || DEFAULT_COMMENT;
}

/** What a person who has never chosen sees: Key, Genre and Label, in Am, keeping what the files hold. */
export const DEFAULT_SAVE_CHOICES: SaveChoices = {
  fields: { key: true, genre: true, label: true, year: false, bpm: false, artwork: false, comment: false },
  key_format: "normal",
  keep_existing: true,
  comment_text: DEFAULT_COMMENT,
};

/** What a Sync starts from: the four values a match brings, the key only by choice, and the comment "ok". */
export const DEFAULT_SYNC_CHOICES: SaveChoices = {
  fields: { key: false, genre: true, label: true, year: true, bpm: true, artwork: false, comment: true },
  key_format: "normal",
  keep_existing: true,
  comment_text: DEFAULT_COMMENT,
};

export const SAVE_CHOICES_KEY = "cuepoint-save-to-files";
export const SYNC_CHOICES_KEY = "cuepoint-sync-to-files";

const STORAGE_KEYS: Record<SaveVariant, string> = { save: SAVE_CHOICES_KEY, sync: SYNC_CHOICES_KEY };

/** Remembered choices, each piece checked, so a stale or hand-edited value cannot reach the engine. */
export function loadSaveChoices(variant: SaveVariant = "save"): SaveChoices {
  const defaults = variant === "sync" ? DEFAULT_SYNC_CHOICES : DEFAULT_SAVE_CHOICES;
  let stored: unknown = null;
  try {
    const text = window.localStorage.getItem(STORAGE_KEYS[variant]);
    stored = text ? JSON.parse(text) : null;
  } catch {
    stored = null;
  }
  const record = stored !== null && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const saved =
    record.fields !== null && typeof record.fields === "object" ? (record.fields as Record<string, unknown>) : {};
  const fields = { ...defaults.fields };
  for (const { id } of [...SAVE_FIELDS, ...SYNC_FIELDS]) {
    if (typeof saved[id] === "boolean") fields[id] = saved[id] as boolean;
  }
  // Artwork is not a row of the Sync window, so a remembered tick for it can never be seen or undone there;
  // the comment is not a row of the Save window.
  if (variant === "sync") fields.artwork = false;
  else fields.comment = false;
  const style = KEY_STYLES.find((entry) => entry.value === record.key_format)?.value;
  return {
    fields,
    key_format: style ?? defaults.key_format,
    keep_existing: typeof record.keep_existing === "boolean" ? record.keep_existing : defaults.keep_existing,
    comment_text: typeof record.comment_text === "string" ? cleanComment(record.comment_text) : defaults.comment_text,
  };
}

export function rememberSaveChoices(choices: SaveChoices, variant: SaveVariant = "save"): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS[variant], JSON.stringify(choices));
  } catch {
    // Choices are a convenience: a store that refuses just means asking again next time.
  }
}

export function noneTicked(choices: SaveChoices): boolean {
  return ![...SAVE_FIELDS, ...SYNC_FIELDS].some(({ id }) => choices.fields[id]);
}

function options(choices: SaveChoices, on: (id: SaveFieldId) => boolean): DialogTagOptions {
  return {
    key_format: choices.key_format,
    write_key: on("key"),
    write_genre: on("genre"),
    write_label: on("label"),
    write_year: on("year"),
    write_bpm: on("bpm"),
    // The Save window has no comment row: it never writes one (Q4, DEC-070). Sync's row does.
    write_comment: on("comment"),
    comment_text: commentText(choices),
    embed_missing_artwork: on("artwork"),
    keep_existing: choices.keep_existing,
  };
}

/** What a Save, and a count of the total, are sent: exactly the ticked rows. */
export function tagOptionsFor(choices: SaveChoices): DialogTagOptions {
  return options(choices, (id) => choices.fields[id]);
}

/**
 * What the one preview is asked with: every field on, and Keep off. Keep off is the superset:
 * its counts hold both `fill` and `replace`, so Keep, a tick and the key style are then
 * applied here without asking again. The list of changes is cut down by Keep on this side.
 * The Sync window has no artwork row, so it never asks for it.
 */
export function previewOptions(choices: SaveChoices, variant: SaveVariant = "save"): DialogTagOptions {
  const asked = (id: SaveFieldId) =>
    id === "artwork" ? variant === "save" : id === "comment" ? variant === "sync" : true;
  return { ...options(choices, asked), keep_existing: false };
}

function counts(choices: SaveChoices, entry: FieldChoiceCounts | undefined): number {
  if (!entry) return 0;
  return entry.fill + (choices.keep_existing ? 0 : entry.replace);
}

/** The files one row will change: fill, plus replace when Keep is off. Key counts in its style. */
export function fieldCount(id: SaveFieldId, choices: SaveChoices, from: TagFieldChoices): number {
  if (id === "key") return counts(choices, from.key[choices.key_format]);
  if (id === "artwork") return from.artwork?.fill ?? 0;
  if (id === "comment") return counts(choices, from.comment);
  return counts(choices, from[id]);
}

/** Camelot code to Rekordbox's classic spelling, as the engine writes it (`_CAMELOT_TO_CLASSIC`). */
const CLASSIC_BY_CODE: Readonly<Record<string, string>> = {
  "1A": "Abm", "1B": "B", "2A": "Ebm", "2B": "F#", "3A": "Bbm", "3B": "Db",
  "4A": "Fm", "4B": "Ab", "5A": "Cm", "5B": "Eb", "6A": "Gm", "6B": "Bb",
  "7A": "Dm", "7B": "F", "8A": "Am", "8B": "C", "9A": "Em", "9B": "G",
  "10A": "Bm", "10B": "D", "11A": "F#m", "11B": "A", "12A": "C#m", "12B": "E",
};

const SEMITONE: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A key as `[pitch class, minor]`, from Camelot or a classic or short spelling; null when it is neither. */
function parseKey(text: string): [number, boolean] | null {
  const trimmed = text.trim();
  const code = /^(1[0-2]|[1-9])([AB])$/i.exec(trimmed);
  const classic = code ? CLASSIC_BY_CODE[`${code[1]}${code[2]!.toUpperCase()}`]! : trimmed;
  const parsed = /^([A-Ga-g])\s*([#♯b♭]?)\s*(maj(?:or)?|min(?:or)?|m)?$/i.exec(classic);
  if (!parsed) return null;
  const mark = parsed[2] === "#" || parsed[2] === "♯" ? 1 : parsed[2] ? -1 : 0;
  const mode = (parsed[3] ?? "").toLowerCase();
  const minor = mode !== "" && !mode.startsWith("maj");
  return [(SEMITONE[parsed[1]!.toUpperCase()]! + mark + 12) % 12, minor];
}

const CODE_BY_PITCH = new Map<string, string>(
  Object.entries(CLASSIC_BY_CODE).map(([code, classic]) => {
    const [pitch, minor] = parseKey(classic)!;
    return [`${pitch}${minor}`, code] as const;
  }),
);

/**
 * A key in a style, as the engine's `key_text` spells it: Am (classic), 8A (Camelot) or
 * Amin, Cmaj (short). A value that is not a key is returned as it came.
 */
export function keyIn(key: string, style: KeyStyle): string {
  const parsed = parseKey(key);
  const code = parsed ? CODE_BY_PITCH.get(`${parsed[0]}${parsed[1]}`) : undefined;
  if (!code) return key;
  if (style === "camelot") return code;
  const classic = CLASSIC_BY_CODE[code]!;
  if (style === "normal") return classic;
  const minor = code.endsWith("A");
  return `${minor ? classic.slice(0, -1) : classic}${minor ? "min" : "maj"}`;
}

export function fileWords(count: number): string {
  return countNoun(count, "file");
}

/** The window's title: "Sync 17 tracks to your files". */
export function saveTitle(count: number): string {
  return SYNC.title(count);
}

/** The main button: the files that get synced, "Sync 17 files", "Nothing to sync", or "Sync files" while they are counted. */
export function syncButton(total: number | null): string {
  if (total === null) return "Sync files";
  return total === 0 ? SYNC.empty : SYNC.button(total);
}

export const NONE_TICKED = "Tick at least one value.";
export const NO_COMMENT = "Type the comment, or untick Comment.";
export const ALREADY_HOLD = "These files already hold these values.";
export const ALL_WAV = "WAV files are skipped (Rekordbox does not read their tags).";

export interface SaveState {
  label: string;
  enabled: boolean;
  /** The line under the buttons: why it is greyed, or what the button will do. */
  reason: string | null;
}

interface SaveStateInput {
  choices: SaveChoices;
  preview: TagWritePreview;
  /** The files a Save would change, from the engine; null while it is being counted. */
  total: number | null;
  /** The tracks the window was opened for (no longer named on a button). */
  count?: number;
  /** Sync's button counts the files written ("Write 17 files"). */
  variant?: SaveVariant;
}

/** The reason most files are skipped, other than already holding the values; null when none are. */
function mainSkip(preview: TagWritePreview): { reason: string; count: number } | null {
  let top: { reason: string; count: number } | null = null;
  for (const [reason, entry] of Object.entries(preview.skipped)) {
    if (reason === "nothing_to_write" || entry.count <= 0) continue;
    if (!top || entry.count > top.count) top = { reason, count: entry.count };
  }
  return top;
}

export function saveState({
  choices,
  preview,
  total,
  variant = "save",
}: SaveStateInput): SaveState {
  const sync = variant === "sync";
  const idle = (reason: string | null, nothing = false): SaveState => ({
    label: syncButton(nothing || noneTicked(choices) ? 0 : total),
    enabled: false,
    reason,
  });
  if (noneTicked(choices)) return idle(NONE_TICKED);
  if (sync && choices.fields.comment && cleanComment(choices.comment_text).trim() === "") {
    return idle(NO_COMMENT);
  }
  // The rows are what the person reads: when every ticked row says 0 files there is nothing to write,
  // whatever the engine's union total says (and without waiting for it).
  const rowsChange = [...SAVE_FIELDS, ...SYNC_FIELDS].some(
    ({ id }) =>
      choices.fields[id] &&
      (id !== "artwork" || !sync) &&
      (id !== "comment" || sync) &&
      fieldCount(id, choices, preview.field_choices) > 0,
  );
  if (rowsChange && total === null) return idle(null);
  if (rowsChange && total !== null && total > 0) {
    return {
      label: syncButton(total),
      enabled: true,
      reason: null,
    };
  }
  // Nothing would change (the rows all read 0, or the engine counted 0). That means the values are already in
  // the files only when the files the preview could read cover the whole selection; otherwise say what held the others back.
  const skip = mainSkip(preview);
  if (skip) {
    return idle(
      skip.reason === "wav" ? ALL_WAV : `${fileWords(skip.count)} skipped: ${fileSkipText(skip.reason)}`,
      true,
    );
  }
  return idle(ALREADY_HOLD, true);
}

export interface ChangeRow {
  id: string;
  file: string;
  what: Array<{ name: string; from: string | null; to: string }>;
}

/**
 * The preview's sample of changes, cut down to what the ticks and Keep now say.
 * A value the file holds is left out while Keep is on, because it will not be written.
 */
export function changeRows(preview: TagWritePreview, choices: SaveChoices): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const change of preview.changes) {
    const what: ChangeRow["what"] = [];
    for (const [field, values] of Object.entries(change.fields)) {
      if (!choices.fields[field as SaveFieldId]) continue;
      if (choices.keep_existing && values.from !== null) continue;
      what.push({
        name: fieldName(field),
        from: values.from,
        to: field === "key" ? keyIn(values.to, choices.key_format) : values.to,
      });
    }
    if (change.artwork && choices.fields.artwork) what.push({ name: "Artwork", from: null, to: "added" });
    if (what.length === 0) continue;
    rows.push({
      id: `${change.track_id}-${change.file_path}`,
      file: change.file_path.split(/[\\/]/).pop() ?? change.file_path,
      what,
    });
  }
  return rows;
}
