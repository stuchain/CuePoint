/**
 * What the Library says and offers about Clean, as pure functions (CLEAN-13).
 *
 * CLEAN-12 gave Clean a page; this step makes every Clean fact about a track
 * visible where people already browse (DEC-072), and every per-track action
 * reachable from the Library's one operations list. The words and the rules
 * about what is offered live here, beside `trackMenu.ts` and `libraryBatch.ts`,
 * so each can be tested without rendering a table, a menu or a panel.
 *
 * **Nothing here decides a Clean rule.** Whether a value can be applied,
 * whether a revert is stale, whether a file can be written: the engine answers,
 * and these functions only say what it answered. What an Activity entry offers
 * is the shell's (`components/shell/activityActions.ts`).
 */
import type {
  ArtworkState,
  LibraryTrackRow,
  MatchCandidate,
  OverrideField,
  OverrideSource,
  TrackFieldChange,
  TrackMatchState,
} from "../../api/cuepointBridge.types";
import type { TrackContextMenuItem } from "../../components/TrackContextMenu";
import { APPLY_FIELDS, APPLY_FIELD_LABELS, applyValue } from "../clean/comparison";
import { formatBpm } from "./trackValues";

export { writesLine } from "../../components/shell/activityActions";

// ------------------------------------------------------------ overrides

/** Where an override came from, as a person would say it. */
export function overrideSourceText(source: OverrideSource | null | undefined): string {
  if (source === "beatport") return "applied from Beatport";
  if (source === "cuepoint") return "typed by you";
  return "set in CuePoint";
}

/** The imported value of one overridable field, as the table would draw it. */
export function importedText(row: LibraryTrackRow, field: OverrideField): string {
  switch (field) {
    case "key":
      return row.key ?? "";
    case "bpm":
      return formatBpm(row.bpm);
    case "genre":
      return row.genre ?? "";
    case "label":
      return row.label ?? "";
    case "year":
      return row.year == null ? "" : String(row.year);
  }
}

/** The value a user sees for one overridable field (DEC-068). */
export function effectiveText(row: LibraryTrackRow, field: OverrideField): string {
  const resolved = {
    key: row.effective_key,
    bpm: row.effective_bpm,
    genre: row.effective_genre,
    label: row.effective_label,
    year: row.effective_year,
  }[field];
  if (resolved === undefined) return importedText(row, field);
  if (resolved === null) return "";
  return field === "bpm" ? formatBpm(resolved as number) : String(resolved);
}

/**
 * The marker an overridden cell carries, or null for a value Rekordbox sent.
 *
 * Its words name the source and what is underneath, because an override hides
 * the imported value and a marker that only said "changed" would leave a
 * person to open the Inspector to learn which way.
 */
export function overrideMark(
  row: LibraryTrackRow,
  field: OverrideField,
): { source: OverrideSource | null; title: string } | null {
  if (!row.overridden?.includes(field)) return null;
  const source = row.override_sources?.[field] ?? null;
  const underneath = importedText(row, field);
  const label = APPLY_FIELD_LABELS[field];
  const said = overrideSourceText(source);
  return {
    source,
    title: `${label} ${said}. Rekordbox has ${underneath === "" ? "none" : underneath}.`,
  };
}

/** What a row with no picture to show says instead. */
export function artworkText(state: ArtworkState | null | undefined): string {
  switch (state) {
    case "embedded":
      return "In the file";
    case "beatport":
      return "From Beatport";
    case "none":
      return "None";
    case "unknown":
      return "Not read yet";
    default:
      return "";
  }
}

/** A match score as the table shows it: one decimal, blank for none. */
export function formatScore(score: number | null | undefined): string {
  return score == null ? "" : score.toFixed(1);
}

// ---------------------------------------------------------------- menu

/** What the Clean entries apply to. */
export interface CleanMenuContext {
  /** How many tracks. */
  count: number;
}

/**
 * The Clean operations, each present only when this build can do it.
 *
 * Absent handlers leave their entries out, which is what a browser-lab render
 * without the engine gets — the same rule `SelectionActions` follows for its
 * Actions button.
 */
export interface CleanMenuHandlers {
  onMatch?: (rematch: boolean) => void;
  onDecide?: (decision: "accept" | "reject") => void;
  onApply?: () => void;
  onEdit?: () => void;
  onCheckFiles?: () => void;
  onWriteTags?: () => void;
}

/**
 * The Clean entries of the operations list (CLEAN-13, DEC-072).
 *
 * Appended after the organization entries and offered by the context menu and
 * the Actions button alike, because they are the same array. Revealing a file
 * is not here: the row menu and the toolbar already offer it, once each.
 */
export function cleanMenuItems(
  context: CleanMenuContext,
  handlers: CleanMenuHandlers,
): TrackContextMenuItem[] {
  if (context.count <= 0) return [];
  const groups: TrackContextMenuItem[][] = [];

  const matching: TrackContextMenuItem[] = [];
  if (handlers.onMatch) {
    const match = handlers.onMatch;
    matching.push(
      { id: "clean-match", label: "Match on Beatport", onSelect: () => match(false) },
      // Matching skips what is already matched or decided (DEC-065); this is
      // the one that asks again, and it still leaves a person's decision alone.
      { id: "clean-rematch", label: "Re-match", onSelect: () => match(true) },
    );
  }
  if (handlers.onDecide) {
    const decide = handlers.onDecide;
    matching.push(
      { id: "clean-accept", label: "Accept match", onSelect: () => decide("accept") },
      { id: "clean-reject", label: "Reject match", onSelect: () => decide("reject") },
    );
  }
  if (handlers.onApply) {
    matching.push({
      id: "clean-apply",
      label: "Apply Beatport values…",
      onSelect: handlers.onApply,
    });
  }
  groups.push(matching);

  if (handlers.onEdit) {
    groups.push([{ id: "clean-edit", label: "Edit metadata…", onSelect: handlers.onEdit }]);
  }

  const files: TrackContextMenuItem[] = [];
  if (handlers.onCheckFiles) {
    files.push({ id: "clean-check", label: "Check files", onSelect: handlers.onCheckFiles });
  }
  if (handlers.onWriteTags) {
    files.push({
      id: "clean-write-tags",
      label: "Write tags to files…",
      onSelect: handlers.onWriteTags,
    });
  }
  groups.push(files);

  // Each group opens with a divider; an empty group has nothing to open.
  return groups.flatMap((group) =>
    group.map((item, at) => (at === 0 ? { ...item, separatorBefore: true } : item)),
  );
}

// ------------------------------------------------------- Beatport zone

/** One overridable field as the Inspector's Beatport zone shows it. */
export interface BeatportFieldRow {
  field: OverrideField;
  label: string;
  /** What Rekordbox sent. */
  imported: string;
  /** What the decided candidate has; empty when it has nothing or there is none. */
  beatport: string;
  /** What a user sees now. */
  effective: string;
  /** Which layer that is: Rekordbox's, or CuePoint's with its source. */
  source: "rekordbox" | OverrideSource | "cuepoint-unknown";
  /**
   * Whether applying this field is offered: a candidate a person or the rule
   * accepted, a value to copy, and not already the value it applied.
   */
  canApply: boolean;
}

/** Where the effective value came from, in words. */
export function fieldSourceText(source: BeatportFieldRow["source"]): string {
  if (source === "rekordbox") return "from Rekordbox";
  if (source === "cuepoint-unknown") return "set in CuePoint";
  return overrideSourceText(source);
}

export function beatportFieldRows(
  row: LibraryTrackRow,
  state: TrackMatchState | null,
  candidate: MatchCandidate | null,
): BeatportFieldRow[] {
  const accepted = state?.state === "accepted" && candidate != null;
  return APPLY_FIELDS.map((field) => {
    const overridden = row.overridden?.includes(field) ?? false;
    const source = overridden ? (row.override_sources?.[field] ?? "cuepoint-unknown") : "rekordbox";
    const beatport = candidate ? (applyValue(field, candidate) ?? "") : "";
    return {
      field,
      label: APPLY_FIELD_LABELS[field],
      imported: importedText(row, field),
      beatport,
      effective: effectiveText(row, field),
      source,
      canApply: accepted && beatport !== "" && source !== "beatport",
    };
  });
}

// ----------------------------------------------------------- reverting

/**
 * The history fields CuePoint owns, which a revert writes back (CLEAN-06).
 *
 * Mirrors `CUEPOINT_REVERTABLE_FIELDS`. Rekordbox's fields are the imported
 * record's history, which stays read-only (DEC-047).
 */
export const CUEPOINT_HISTORY_FIELDS: ReadonlySet<string> = new Set([
  "cuepoint_rating",
  "favorite",
  "notes",
  "cuepoint_key",
  "cuepoint_bpm",
  "cuepoint_genre",
  "cuepoint_label",
  "cuepoint_year",
  "match_state",
  "tag",
]);

/** Whether a history row offers Revert: CuePoint's own, and addressable. */
export function canRevertChange(change: TrackFieldChange): boolean {
  return change.id != null && CUEPOINT_HISTORY_FIELDS.has(change.field);
}
