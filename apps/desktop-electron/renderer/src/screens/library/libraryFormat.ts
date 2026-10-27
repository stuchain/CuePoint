/**
 * Turning library payloads into the sentences the page shows (LIBRARY-11).
 *
 * Pure functions, separated from the component on purpose: the wording is what
 * a user acts on, and the wording around a refresh decides whether they
 * understand that DEC-003's removals are permanent. That deserves tests that
 * read like the sentences themselves, not tests that go through a render.
 */
import { formatDayTime } from "../../format/dates";
import { countNoun, formatCount as groupCount } from "../../format/counts";
import { UP_TO_DATE } from "../../format/words";
import { formatTotal } from "../../format/durations";
import type {
  LibraryQuickFacets,
  LibrarySourceInfo,
  RefreshDiff,
  RefreshApplied,
} from "../../api/cuepointBridge.types";

/**
 * The shared count helpers (C169), re-exported under the names other pages already import:
 * `formatCount` groups digits by the computer's locale ("3,880").
 */
export function formatCount(count: number | null | undefined, locale?: string): string {
  return groupCount(count ?? 0, locale);
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
  return formatDayTime(parsed);
}

type SourceState = "missing" | "changed" | "unknown" | "unchanged";

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

/**
 * The badge beside the export's path (LIB-3): said about Rekordbox, because
 * "out of date" did not say what it was out of date with.
 */
export function sourceBadge(state: SourceState): string {
  switch (state) {
    case "unchanged":
      return UP_TO_DATE;
    case "changed":
      return "Changed in Rekordbox";
    case "missing":
      return "File not found";
    case "unknown":
      return "Not checked yet";
  }
}

export function sourceStateMessage(state: SourceState): string {
  switch (state) {
    case "missing":
      return "That file is no longer where it was. Import it again from its new location.";
    case "changed":
      return "This Rekordbox file has changed since your last import. Check what a refresh would do.";
    case "unknown":
      return "CuePoint could not tell whether this Rekordbox file has changed. Check for changes to compare.";
    case "unchanged":
      return "Unchanged since your last import.";
  }
}

interface DiffLine {
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
 *
 * Changed cue points and grids are one line, counted in tracks (WAVE-04): they
 * are read-only copies of Rekordbox's, so there is nothing in them to refuse,
 * and a per-cue list would bury the lines that matter (DEC-118).
 */
export function diffLines(diff: RefreshDiff): DiffLine[] {
  const lines: DiffLine[] = [
    // M275: three words, New / Changed / Removed, and one verb for what goes: remove.
    { key: "added", label: "New tracks", count: diff.tracks.added.count },
    { key: "changed", label: "Changed tracks", count: diff.tracks.changed.count },
    {
      key: "removed",
      label: "Removed tracks",
      count: diff.tracks.removed.count,
      destructive: true,
    },
    { key: "relinked", label: "Re-linked after renumbering", count: diff.tracks.relinked.count },
    {
      key: "marks_changed",
      label: "Tracks whose cues or beat grid changed",
      count: diff.tracks.marks_changed ?? 0,
    },
    { key: "playlists_added", label: "New playlists", count: diff.playlists.added.count },
    { key: "playlists_changed", label: "Changed playlists", count: diff.playlists.changed.count },
    { key: "playlists_removed", label: "Removed playlists", count: diff.playlists.removed.count },
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
    `${countNoun(count, "track")} in your library ${count === 1 ? "is" : "are"} no longer in this Rekordbox file. ` +
    "Refreshing removes them, along with any ratings, tags and history CuePoint " +
    "has for them. This cannot be undone."
  );
}

/**
 * DEC-011's warning: tracks that would be deleted carry the user's own work.
 *
 * Since CLEAN-05 that is not only a Collection or Set holding them but a
 * CuePoint rating, favorite or note, a tag, a match decision or an override —
 * everything a refresh would take that nothing can put back (DEC-011 as
 * amended). Each kind the engine counted is named once; a kind with none is
 * left out, and a refresh whose deletions touch none of it shows nothing.
 */
export function referenceWarning(diff: RefreshDiff): string | null {
  const references = diff.references;
  if (!references || !references.has_references) return null;
  const kinds: string[] = [];
  if (references.collection_count > 0) {
    const holders = countNoun(references.collection_count, "Collection");
    kinds.push(`${groupCount(references.collection_track_count)} in ${holders}`);
  }
  if (references.set_count > 0) {
    // Sets as their own kind, counted as the Collections are: "4 in 1 Set",
    // the engine's own refusal wording (PREP-02). An engine older than
    // `set_track_count` sends none, and the holders alone are still true.
    const holders = countNoun(references.set_count, "Set");
    kinds.push(
      references.set_track_count > 0
        ? `${groupCount(references.set_track_count)} in ${holders}`
        : `in ${holders}`,
    );
  }
  const counted: Array<[number, string]> = [
    [references.rated_track_count, "rated or noted"],
    [references.tagged_track_count, "tagged"],
    [references.reviewed_track_count, "reviewed"],
    [references.edited_track_count, "edited"],
  ];
  for (const [count, words] of counted) {
    if (count > 0) kinds.push(`${groupCount(count)} ${words}`);
  }
  const one = references.referenced_track_count === 1;
  return (
    `${countNoun(references.referenced_track_count, "track")} you are about to ` +
    `remove ${one ? "carries" : "carry"} your own work: ${kinds.join(", ")}. ` +
    `Removing ${one ? "it" : "them"} removes that too.`
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
  return `Remove ${countNoun(removed, "track")} and refresh`;
}

/** The line shown after a refresh finishes. */
export function appliedLine(result: RefreshApplied): string {
  const parts: string[] = [];
  if (typeof result.track_count === "number") parts.push(`${countNoun(result.track_count, "track")} in your library`);
  if (result.tracks_inserted > 0) parts.push(`${groupCount(result.tracks_inserted)} added`);
  if (result.tracks_deleted > 0) parts.push(`${groupCount(result.tracks_deleted)} removed`);
  if (result.relinked_count > 0) parts.push(`${groupCount(result.relinked_count)} re-linked`);
  // Marks CuePoint cannot read are skipped and counted, never stored (DEC-118).
  const skipped = result.marks?.skipped ?? 0;
  if (skipped > 0) parts.push(`${countNoun(skipped, "unreadable mark")} skipped`);
  return parts.join(" · ");
}

/** The refresh toast: what moved ("Library refreshed: 12 added · 2 removed"), or just that it did. */
export function refreshedWords(result: RefreshApplied): string {
  const parts: string[] = [];
  if (result.tracks_inserted > 0) parts.push(`${groupCount(result.tracks_inserted)} added`);
  if (result.tracks_deleted > 0) parts.push(`${groupCount(result.tracks_deleted)} removed`);
  return parts.length > 0 ? `Library refreshed: ${parts.join(" · ")}` : "Library refreshed.";
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
      return "Import a Rekordbox file first.";
    case "LIBRARY_XML_NO_COLLECTION":
      return (
        "That file has no collection in it. In Rekordbox, use " +
        "File → Export Collection in XML format."
      );
    default:
      return error?.message || "Something went wrong.";
  }
}

/**
 * A total running time a person reads: "3 h 52 min", "52 min", "1 h", "45 s".
 * Null where there is none (a scope whose tracks have no length), so the
 * header leaves the part out rather than saying "0 s".
 */
export function formatLength(seconds: number): string | null {
  if (!(seconds > 0)) return null;
  return formatTotal(seconds);
}

/** "122\u2013128 BPM", "124 BPM" for one value, null when no track has a BPM. */
export function formatBpmRange(min: number | null, max: number | null): string | null {
  if (min === null) return null;
  const low = Math.round(min);
  const high = Math.round(max ?? min);
  return low === high ? `${low} BPM` : `${low}\u2013${high} BPM`;
}

/**
 * What a scope holds, as the parts of the header's summary line (K9): tracks,
 * running time, BPM range and number of keys, each left out where the scope has
 * nothing to say. Before the facts arrive only the count the page already
 * knows is shown, never numbers of the scope the user has just left.
 */
export function scopeFactsLine(facts: LibraryQuickFacets | null, fallbackCount: number): string[] {
  if (!facts) return [countNoun(fallbackCount, "track")];
  const parts = [countNoun(facts.total, "track")];
  const length = formatLength(facts.total_seconds);
  if (length) parts.push(length);
  const bpm = formatBpmRange(facts.bpm.min, facts.bpm.max);
  if (bpm) parts.push(bpm);
  if (facts.keys.length > 0) parts.push(countNoun(facts.keys.length, "key"));
  return parts;
}
