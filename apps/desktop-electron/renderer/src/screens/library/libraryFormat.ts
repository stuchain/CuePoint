/**
 * Turning library payloads into the sentences the page shows (LIBRARY-11).
 *
 * Pure functions, separated from the component on purpose: the wording is what
 * a user acts on, and the wording around a refresh decides whether they
 * understand that DEC-003's removals are permanent. That deserves tests that
 * read like the sentences themselves, not tests that go through a render.
 */
import type {
  LibrarySourceInfo,
  RefreshDiff,
  RefreshApplied,
} from "../../api/cuepointBridge.types";

/** Thousands separators, because "3880 tracks" reads as a serial number. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/** "3,880 tracks" / "1 track". Counts are the whole point of this page. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

/** Just the file name, for a path too long to show in full. */
export function fileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

/**
 * A date a person reads, or the raw string if it cannot be parsed.
 *
 * Never throws and never renders "Invalid Date": a timestamp the engine wrote
 * in a form this build does not expect is still better shown as-is than as an
 * error where a date belongs.
 */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type SourceState = "missing" | "changed" | "unknown" | "unchanged";

/**
 * What the export file looks like now, as one of four states.
 *
 * `changed: null` is its own state rather than being folded into "unchanged".
 * The engine returns null for "I could not tell", and treating that as "nothing
 * has changed" would tell a user their library is current when nobody checked.
 */
export function sourceState(source: LibrarySourceInfo): SourceState {
  if (!source.exists) return "missing";
  if (source.changed === true) return "changed";
  if (source.changed === null) return "unknown";
  return "unchanged";
}

export function sourceStateMessage(state: SourceState): string {
  switch (state) {
    case "missing":
      return "That file is no longer where it was. Import it again from its new location.";
    case "changed":
      return "This export has changed since your last import. Check what a refresh would do.";
    case "unknown":
      return "CuePoint could not tell whether this export has changed. Check to be sure.";
    case "unchanged":
      return "Unchanged since your last import.";
  }
}

export interface DiffLine {
  key: string;
  label: string;
  count: number;
  /** True for the line that describes permanent loss (DEC-003). */
  destructive?: boolean;
}

/**
 * The diff as lines, with the zeroes dropped.
 *
 * Removals are kept even at zero, and are the only line that is: "0 removed" is
 * the reassurance a user is looking for before they press the button, and a
 * line that simply is not there does not reassure anybody.
 */
export function diffLines(diff: RefreshDiff): DiffLine[] {
  const lines: DiffLine[] = [
    { key: "added", label: "New tracks", count: diff.tracks.added.count },
    { key: "changed", label: "Updated tracks", count: diff.tracks.changed.count },
    {
      key: "removed",
      label: "Tracks removed from Rekordbox",
      count: diff.tracks.removed.count,
      destructive: true,
    },
    { key: "relinked", label: "Re-linked after renumbering", count: diff.tracks.relinked.count },
    { key: "playlists_added", label: "New playlists", count: diff.playlists.added.count },
    { key: "playlists_changed", label: "Edited playlists", count: diff.playlists.changed.count },
    { key: "playlists_removed", label: "Deleted playlists", count: diff.playlists.removed.count },
  ];
  return lines.filter((line) => line.count > 0 || line.destructive);
}

/**
 * The warning shown above a diff that would delete tracks, or null.
 *
 * Names what goes with them. A user reading "25 tracks removed" thinks about
 * 25 rows; what they actually lose is every rating, tag and play they recorded
 * against those rows, and DEC-003 does not give it back.
 */
export function removalWarning(diff: RefreshDiff): string | null {
  const count = diff.tracks.removed.count;
  if (count === 0) return null;
  return (
    `${pluralize(count, "track")} in your library are no longer in this export. ` +
    "Refreshing deletes them, along with any ratings, tags and history CuePoint " +
    "has for them. This cannot be undone."
  );
}

/**
 * DEC-011's warning: something else is using tracks that would be deleted.
 *
 * Zero in every library this build can produce — Collections arrive in Phase 6
 * and Sets in Phase 10 — so this returns null today. It is written now because
 * the flow that has to show it, and the acknowledgement that clears it, are
 * what would otherwise have to be retrofitted around a working refresh.
 */
export function referenceWarning(diff: RefreshDiff): string | null {
  const references = diff.references;
  if (!references || !references.has_references) return null;
  const holders = [
    references.collection_count > 0
      ? pluralize(references.collection_count, "Collection")
      : null,
    references.set_count > 0 ? pluralize(references.set_count, "Set") : null,
  ].filter(Boolean);
  return (
    `${pluralize(references.referenced_track_count, "track")} you are about to ` +
    `remove ${references.referenced_track_count === 1 ? "is" : "are"} used in ` +
    `${holders.join(" and ")}. Removing them changes those too.`
  );
}

/** True when the apply needs an explicit extra acknowledgement (DEC-011). */
export function needsReferenceConfirmation(diff: RefreshDiff): boolean {
  return Boolean(diff.references?.has_references);
}

/**
 * The confirm button's label.
 *
 * It says the number when tracks would be deleted, so the irreversible count is
 * on the button being pressed rather than only in the paragraph above it.
 */
export function applyLabel(diff: RefreshDiff): string {
  const removed = diff.tracks.removed.count;
  if (removed === 0) return "Apply changes";
  return `Remove ${pluralize(removed, "track")} and refresh`;
}

/** The line shown after a refresh finishes. */
export function appliedLine(result: RefreshApplied): string {
  const parts = [`${pluralize(result.track_count, "track")} in your library`];
  if (result.tracks_inserted > 0) parts.push(`${formatCount(result.tracks_inserted)} added`);
  if (result.tracks_deleted > 0) parts.push(`${formatCount(result.tracks_deleted)} removed`);
  if (result.relinked_count > 0) parts.push(`${formatCount(result.relinked_count)} re-linked`);
  return parts.join(" · ");
}

/**
 * What a failed job means, in words a user can act on.
 *
 * The engine's codes are the reliable part of a job error; the messages behind
 * them are written for whoever is reading a log. These are the two a user meets
 * by doing something ordinary, so they get an answer rather than a diagnosis.
 */
export function jobErrorMessage(error?: { code?: string; message?: string }): string {
  switch (error?.code) {
    case "LIBRARY_NOT_IMPORTED":
      return "Import a Rekordbox collection first.";
    case "LIBRARY_XML_NO_COLLECTION":
      return (
        "That file has no collection in it. In Rekordbox, use " +
        "File → Export Collection in xml format."
      );
    default:
      return error?.message || "Something went wrong.";
  }
}
