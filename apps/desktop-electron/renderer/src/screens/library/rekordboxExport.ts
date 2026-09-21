/**
 * What the Rekordbox export dialog says, as pure functions (EXPORT-07).
 *
 * The export is the one thing CuePoint writes that a DJ then loads into the
 * software they play from, so this phase's risk is wording rather than
 * mechanism: a preview that undersells a warning is how someone exports what
 * they did not mean to. Every sentence the dialog shows is therefore made
 * here, from the engine's preview and nothing else, in the shape `tagWriting.ts`
 * set for "Write tags to files" — so a test can hold each sentence against a
 * real engine answer without drawing a pixel.
 *
 * The engine counts; this names what it counted. No number is computed here
 * that the engine did not state, so the dialog cannot disagree with the export
 * it describes (DEC-084).
 */
import type {
  RekordboxExportField,
  RekordboxExportPlaylistPreview,
  RekordboxExportPreview,
  RekordboxExportRecord,
  RekordboxExportRefusal,
  RekordboxExportResult,
  RekordboxExportSourceState,
  RekordboxKeyFormat,
  RememberedRekordboxExport,
} from "../../api/cuepointBridge.types";
import type { CollectionTreeNode } from "./collectionTree";
import { fileName, formatWhen, pluralize } from "./libraryFormat";
import { KEY_FORMATS } from "./tagWriting";

// ------------------------------------------------------------------ notation

/** The three notations and their labels — the file-tag path's own (DEC-089). */
export const EXPORT_KEY_FORMATS: ReadonlyArray<{ value: RekordboxKeyFormat; label: string }> =
  KEY_FORMATS;

export const DEFAULT_EXPORT_KEY_FORMAT: RekordboxKeyFormat = "normal";

/** A notation's label as the dialog offers it. */
export function keyFormatLabel(format: RekordboxKeyFormat): string {
  return EXPORT_KEY_FORMATS.find((entry) => entry.value === format)?.label ?? format;
}

/** A notation named inside a sentence: "Camelot (8A)". */
export function keyFormatName(format: RekordboxKeyFormat): string {
  switch (format) {
    case "camelot":
      return "Camelot (8A)";
    case "short":
      return "short (Amin)";
    default:
      return "classic (Am)";
  }
}

/**
 * What choosing a notation costs, said where it is chosen (DEC-089).
 *
 * The importer reads `Tonality` as it finds it, so a file exported in Camelot
 * and imported again puts `8A` into CuePoint's own key column for every track
 * it rewrote, beside `Am` on the rest. The user accepted that as opt-in; this
 * line is the "opt" being informed. Classic is what Rekordbox writes and what
 * CuePoint already holds, so it costs nothing and says nothing.
 */
export function keyFormatConsequence(format: RekordboxKeyFormat): string | null {
  if (format === "normal") return null;
  const name = format === "camelot" ? "Camelot keys (8A)" : "short keys (Amin)";
  return (
    `If you import this file into CuePoint later, its ${name} become CuePoint's own key — ` +
    "mixed with classic keys (Am) on any track this export does not rewrite."
  );
}

// ------------------------------------------------------------------ the source

/** A byte count in words, exact when rounding would hide the difference. */
export function formatSize(bytes: number, other?: number | null): string {
  const exact = `${bytes.toLocaleString()} bytes`;
  if (bytes < 1024) return exact;
  const rounded = (value: number) =>
    value >= 1024 * 1024
      ? `${(value / (1024 * 1024)).toFixed(1)} MB`
      : `${(value / 1024).toFixed(1)} KB`;
  // Two sizes that round to the same text would read as "no change" beside a
  // warning saying there was one.
  if (other != null && other !== bytes && rounded(other) === rounded(bytes)) return exact;
  return rounded(bytes);
}

/** The line naming the file the export patches, and the promise about it. */
export function sourceLine(source: RekordboxExportSourceState): string {
  return `Patches a copy of ${fileName(source.path)}, the file your library was imported from. That file is never changed.`;
}

/**
 * The warning a changed source gets, with its real numbers (DEC-082).
 *
 * Reported, never refused: the export can still go ahead, and "Refresh first"
 * sits beside this as the one-click way to bring the library back in step.
 */
export function stalenessWarning(source: RekordboxExportSourceState): string | null {
  if (source.stale === null) {
    return (
      "CuePoint could not record this file's state when it was imported, so it cannot tell " +
      "whether the file has changed since. Refreshing first makes sure."
    );
  }
  if (!source.stale) return null;
  const facts: string[] = [];
  if (source.signals.includes("mtime")) {
    facts.push(
      `saved ${formatWhen(source.actual_modified_at)}, after the import read it as saved ` +
        `${formatWhen(source.recorded_modified_at)}`,
    );
  }
  if (source.signals.includes("size") && source.actual_size_bytes != null) {
    const was = source.recorded_size_bytes;
    facts.push(
      was == null
        ? `now ${formatSize(source.actual_size_bytes)}`
        : `now ${formatSize(source.actual_size_bytes, was)}, was ${formatSize(was, source.actual_size_bytes)}`,
    );
  }
  const detail = facts.length > 0 ? ` (${facts.join("; ")})` : "";
  return (
    `${fileName(source.path)} has changed since you imported it${detail}. ` +
    "The export patches the file as it is now, so it can differ from what CuePoint shows. " +
    "Refreshing first brings the two back in step."
  );
}

/** Tracks in the file CuePoint does not know: kept as they are, and counted. */
export function unknownTracksLine(preview: RekordboxExportPreview): string | null {
  const count = preview.unknown_track_count;
  if (count <= 0) return null;
  return (
    `${pluralize(count, "track")} in the file ${count === 1 ? "is" : "are"} not in your CuePoint ` +
    `library. ${count === 1 ? "It is" : "They are"} exported exactly as ${count === 1 ? "it is" : "they are"}.`
  );
}

// ------------------------------------------------------------------ the tracks

/** The six values an export can rewrite, in the export's order. */
export const EXPORT_FIELDS: ReadonlyArray<{ field: RekordboxExportField; label: string }> = [
  { field: "key", label: "Key" },
  { field: "bpm", label: "BPM" },
  { field: "genre", label: "Genre" },
  { field: "label", label: "Label" },
  { field: "year", label: "Year" },
  { field: "rating", label: "Rating" },
];

/** How many tracks the exported file holds: the source's own count. */
export function trackCountLine(preview: RekordboxExportPreview): string {
  return `${pluralize(preview.track_count, "track")} in the exported file`;
}

/** How many of them carry a CuePoint value, or that none does. */
export function changeLine(preview: RekordboxExportPreview): string {
  const changed = preview.changed_track_count;
  if (changed === 0) {
    return "No track has a CuePoint value that differs from the file, so none is rewritten.";
  }
  return `${pluralize(changed, "track")} rewritten with CuePoint's values`;
}

/** The per-field breakdown, one line per field that changes, in order. */
export function fieldLines(preview: RekordboxExportPreview): string[] {
  return EXPORT_FIELDS.filter(({ field }) => (preview.fields_changed[field] ?? 0) > 0).map(
    ({ field, label }) => `${label}: ${pluralize(preview.fields_changed[field] ?? 0, "track")}`,
  );
}

/**
 * The honest description of an export that changes nothing.
 *
 * The engine answers `changes_nothing` itself, because a file identical to its
 * source is worth saying so plainly rather than as a row of zeros.
 */
export function copyLine(preview: RekordboxExportPreview): string | null {
  return preview.changes_nothing
    ? "As it stands this export is an exact copy of your collection file: nothing is rewritten and no playlist is added."
    : null;
}

// --------------------------------------------------------------- the playlists

/**
 * What the playlist part says above its list.
 *
 * `chosen` is how many nodes are ticked, which is what tells "you chose
 * nothing" from "what you chose holds nothing" — two different next steps.
 */
export function playlistHeadline(preview: RekordboxExportPreview, chosen: number): string {
  const count = preview.playlists.length;
  if (count > 0) {
    return `${pluralize(count, "playlist")} added, in a folder called “${preview.playlist_folder}”`;
  }
  if (chosen === 0) {
    return "No playlists are added. Tick a Collection to send it to Rekordbox as a playlist.";
  }
  return "What you ticked holds no Collections, so no playlists are added.";
}

/** One playlist's count: what is written, and what the file cannot hold. */
export function playlistCount(playlist: RekordboxExportPlaylistPreview): string {
  const written = pluralize(playlist.entry_count, "track");
  if (playlist.dropped_count === 0) return written;
  return `${written} of ${playlist.requested_count.toLocaleString()}`;
}

/** What kind of playlist it becomes, when that is not obvious. */
export function playlistKindNote(playlist: RekordboxExportPlaylistPreview): string | null {
  return playlist.kind === "smart" ? "Smart Collection, as it matches now" : null;
}

// ---------------------------------------------------------------- the warnings

export interface ExportWarning {
  key: "absent" | "missing" | "unchecked" | "collision";
  text: string;
  /** A note says something worth knowing; a warning something that changes the file. */
  tone: "warning" | "note";
}

/**
 * The warnings, in the order the specification gives them: tracks the file
 * lacks, missing files, a name collision.
 */
export function exportWarnings(preview: RekordboxExportPreview): ExportWarning[] {
  const warnings: ExportWarning[] = [];

  const absent = preview.absent_track_count;
  if (absent > 0) {
    const dropped = preview.dropped_reference_count;
    const who = `${pluralize(absent, "track")} in your library ${absent === 1 ? "is" : "are"} not in this file`;
    warnings.push({
      key: "absent",
      tone: dropped > 0 ? "warning" : "note",
      text:
        dropped > 0
          ? `${who}, so ${pluralize(dropped, "playlist entry", "playlist entries")} pointing at ${
              absent === 1 ? "it" : "them"
            } ${dropped === 1 ? "is" : "are"} left out. The playlists above count what is left.`
          : `${who}. None of the playlists above holds ${absent === 1 ? "it" : "them"}.`,
    });
  }

  if (preview.missing_file_count == null) {
    warnings.push({
      key: "unchecked",
      tone: "note",
      text: "Files have never been checked, so tracks whose audio file is missing are not counted.",
    });
  } else if (preview.missing_file_count > 0) {
    const missing = preview.missing_file_count;
    warnings.push({
      key: "missing",
      tone: "warning",
      text:
        `${pluralize(missing, "track")} ${missing === 1 ? "has its" : "have their"} audio file missing. ` +
        `${missing === 1 ? "It is" : "They are"} exported unchanged, and Rekordbox will show ` +
        `${missing === 1 ? "it" : "them"} as missing too.`,
    });
  }

  if (preview.playlist_folder_renamed && preview.playlist_folder) {
    const base = preview.playlist_folder.replace(/\s\(\d+\)$/, "");
    warnings.push({
      key: "collision",
      tone: "warning",
      text:
        `Your file already has a top-level folder called “${base}”, so the playlists go in ` +
        `“${preview.playlist_folder}” instead. Nothing is added to the existing folder.`,
    });
  }

  return warnings;
}

// -------------------------------------------------------------- confirmation

/** What the confirm button says it will do — never "OK". */
export function confirmLabel(preview: RekordboxExportPreview | null): string {
  if (!preview) return "Export";
  const tracks = pluralize(preview.track_count, "track");
  const playlists = preview.playlists.length;
  return playlists > 0
    ? `Export ${tracks} and ${pluralize(playlists, "playlist")}`
    : `Export ${tracks}`;
}

export interface ConfirmState {
  /** The preview answering the choices on screen now, or null. */
  preview: RekordboxExportPreview | null;
  /** A refusal standing in the preview's or the start's place. */
  refusal: RekordboxExportRefusal | null;
  /** The file the save dialog returned, or null. */
  destination: string | null;
  /** True while a preview is being asked for or an export is running. */
  working: boolean;
}

/**
 * Why the confirm button is disabled, or null when it is not.
 *
 * Said rather than only greyed, as the refresh preview does: a button that
 * cannot be pressed and does not say why is a dead end.
 */
export function confirmBlocker(state: ConfirmState): string | null {
  if (state.working) return null;
  if (state.refusal) return "Nothing can be exported until the problem above is dealt with.";
  if (!state.preview) return "The preview has not answered yet.";
  if (!state.destination) return "Choose where to save the file.";
  return null;
}

/** Whether confirm can be pressed. */
export function canConfirm(state: ConfirmState): boolean {
  return !state.working && confirmBlocker(state) === null;
}

// ---------------------------------------------------------------- refusals

/** What each library job is called in a sentence about waiting for it. */
const BUSY_JOB_NAMES: Record<string, string> = {
  library_import: "An import",
  library_refresh_preview: "A refresh check",
  library_refresh_apply: "A refresh",
  library_batch: "A batch edit",
  rekordbox_export: "Another export",
};

/** The next step a refusal offers, which the dialog draws as a button. */
export type RefusalStep = "import" | "retry" | "choose" | "wait" | null;

/** What a refusal says, in the order a person needs it: what, then what to do. */
export function refusalText(refusal: RekordboxExportRefusal): string {
  const where = refusal.path ? `: ${refusal.path}` : "";
  switch (refusal.reason) {
    case "source_never_imported":
      return "There is no collection file to export from. Import your Rekordbox collection first.";
    case "source_missing":
      return (
        `The collection file this library was imported from is not there any more${where}. ` +
        "The export patches that file, so it has to be found first: import it again from where it is now."
      );
    case "source_unreadable":
      return (
        `The collection file could not be read${where}. ` +
        "Close anything that has it open, or check that it can be read, and try again."
      );
    case "source_invalid":
      return (
        `The collection file cannot be read as a Rekordbox collection${where}. ` +
        "Export the collection from Rekordbox again and import that file."
      );
    case "destination_is_source":
      return "That is the file your library was imported from, and an export never writes over it. Choose a different file.";
    case "destination_not_xml":
      return "An export is saved as an .xml file. Choose a name ending in .xml.";
    case "destination_is_folder":
      return "That is a folder. Choose a file name to save the export as.";
    case "destination_folder_missing":
      return "The folder for that file does not exist. Choose a folder that does.";
    case "destination_blank":
      return "Choose where to save the export.";
    default:
      break;
  }
  if (refusal.code === "LIBRARY_BUSY") {
    const name = (refusal.job_type && BUSY_JOB_NAMES[refusal.job_type]) ?? "Another library job";
    return `${name} is running. The export waits for it, and the preview answers when it ends.`;
  }
  return refusal.message;
}

/** Which next step a refusal offers. */
export function refusalStep(refusal: RekordboxExportRefusal): RefusalStep {
  if (refusal.code === "LIBRARY_BUSY") return "wait";
  switch (refusal.reason) {
    case "source_never_imported":
    case "source_missing":
    case "source_invalid":
      return "import";
    case "source_unreadable":
      return "retry";
    default:
      return refusal.code === "REKORDBOX_EXPORT_DESTINATION_REFUSED" ? "choose" : null;
  }
}

// ---------------------------------------------------------------- the result

/** What a finished export says. */
export function resultHeadline(result: RekordboxExportResult): string {
  const name = fileName(result.destination_path);
  if (result.outcome === "cancelled") {
    return "Stopped. Nothing was written, and the file you chose was left as it was.";
  }
  if (result.outcome === "failed") {
    return `The export failed: ${result.error ?? "no reason was given"}.`;
  }
  const parts = [pluralize(result.track_count, "track")];
  parts.push(`${result.changed_track_count.toLocaleString()} rewritten`);
  parts.push(`${pluralize(result.playlist_count, "playlist")} added`);
  return `Exported to ${name}: ${parts.join(", ")}.`;
}

/**
 * How to see the export in Rekordbox, which does not merge it (DEC-078).
 *
 * The file is loaded as a second library beside the user's own, which is the
 * sentence that stops someone looking for their playlists in the wrong place.
 */
export const OPEN_IN_REKORDBOX =
  "To open it in Rekordbox, choose this file as the Imported Library under Preferences → Advanced → " +
  "Database → rekordbox xml. It appears in the tree as “rekordbox xml” (turn that on under Preferences → " +
  "View → Layout if it is hidden), beside your collection rather than merged into it.";

// ------------------------------------------------------------- what is chosen

/**
 * The ids to send for what is ticked, in tree order.
 *
 * A ticked folder stands for everything under it, as the engine reads it, so
 * a node under a ticked folder is not sent again. The engine would export it
 * once either way; sending it once is what keeps the request and the screen
 * saying the same thing.
 */
export function exportChoice(
  tree: readonly CollectionTreeNode[],
  ticked: ReadonlySet<number>,
): number[] {
  const out: number[] = [];
  const walk = (nodes: readonly CollectionTreeNode[], covered: boolean) => {
    for (const node of nodes) {
      const chosen = !covered && ticked.has(node.id);
      if (chosen) out.push(node.id);
      walk(node.children, covered || chosen);
    }
  };
  walk(tree, false);
  return out;
}

/** The nodes a ticked folder already stands for, drawn ticked and fixed. */
export function coveredByFolder(
  tree: readonly CollectionTreeNode[],
  ticked: ReadonlySet<number>,
): Set<number> {
  const covered = new Set<number>();
  const walk = (nodes: readonly CollectionTreeNode[], under: boolean) => {
    for (const node of nodes) {
      if (under) covered.add(node.id);
      walk(node.children, under || ticked.has(node.id));
    }
  };
  walk(tree, false);
  return covered;
}

// ---------------------------------------------------------------- Settings

/** Where the next export's save dialog opens (DEC-083). */
export function rememberedFolderLine(remembered: RememberedRekordboxExport): string {
  if (!remembered.folder) {
    return "Nothing exported yet. The first export's save dialog opens in your Documents folder.";
  }
  if (!remembered.folder_exists) {
    return `${remembered.folder} — no longer there, so the next save dialog opens in your Documents folder.`;
  }
  return remembered.folder;
}

/** How a recorded export ended, in a few words. */
export function historyOutcome(record: RekordboxExportRecord): string {
  switch (record.outcome) {
    case "written":
      return [
        pluralize(record.track_count, "track"),
        `${record.changed_track_count.toLocaleString()} rewritten`,
        pluralize(record.playlists.length, "playlist"),
        keyFormatName(record.key_format),
      ].join(" · ");
    case "cancelled":
      return "Stopped — nothing was written";
    default:
      return `Failed: ${record.error ?? "no reason was given"}`;
  }
}

/** When a recorded export ran. */
export function historyWhen(record: RekordboxExportRecord): string {
  return formatWhen(record.finished_at ?? record.started_at);
}
