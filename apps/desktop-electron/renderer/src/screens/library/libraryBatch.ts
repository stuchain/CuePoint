/**
 * What a batch is, in the words two surfaces both use (ORG-11, DEC-045, DEC-063).
 *
 * The context menu and the selection toolbar offer the same operations, and
 * they offer them by building the same value and handing it to the same entry
 * point. A second vocabulary — one for the menu, one for the toolbar — is how
 * "Rate ★★★" and "Rate ★★★" come to mean two different requests.
 *
 * **A selection crosses the wire as what it is.** A list of tracks goes as a
 * list. "Everything matching" goes as the query, plus the handful of ids the
 * user took back out of it — which is what the count on screen already says,
 * and is bounded by what a person can click. Sending the query alone would
 * apply the batch to tracks that were deselected; sending 47,913 ids would be
 * the thing DEC-045 exists to prevent.
 */
import type {
  BatchOperation,
  BatchResult,
  BatchSelection,
  OverrideField,
} from "../../api/cuepointBridge.types";
import { starsFor } from "./filterText";
import type { LibraryQuery } from "./libraryQuery";
import type { Selection } from "./trackSelection";

/**
 * Above this many tracks a batch is confirmed first and runs as a job.
 *
 * The engine's `BATCH_JOB_THRESHOLD`, mirrored so the confirmation and the job
 * happen at the same number rather than one either side of it. A test holds
 * the two together, because a renderer that confirmed at 500 and the engine
 * that forked at 1,000 would show a warning for work that never left the
 * request thread.
 */
export const BATCH_JOB_THRESHOLD = 1_000;

/**
 * The operations the Library's menu and toolbar offer.
 *
 * All ten of the engine's batch operations: ORG-11's six, and since CLEAN-13
 * accepting, rejecting and applying matches and hand edits. Extracted from the
 * wire type so a renamed operation fails to compile here rather than at the
 * engine.
 */
export type LibraryBatchKind = BatchOperation["kind"];

/** A hand edit over a selection: one field, and its value or null to clear. */
export interface OverrideEdit {
  field: OverrideField;
  value: string | number | null;
}

/** One operation, with what it applies named for the sentences below. */
export interface BatchAction {
  kind: LibraryBatchKind;
  /**
   * A rating, a flag, a tag or Collection id; the fields an apply copies; or a
   * hand edit. Nothing for accepting and rejecting, which take none.
   */
  value?: number | boolean | null | OverrideField[] | OverrideEdit;
  /** A tag's name, a Collection's name, the fields, or the value itself. */
  target: string;
}

/** Whether reverting a batch of this kind is offered (CLEAN-06): all but membership. */
export function canRevertKind(kind: LibraryBatchKind): boolean {
  return kind !== "add_to_collection" && kind !== "remove_from_collection";
}

/**
 * The tracks a batch applies to, as the engine's shape (DEC-045).
 *
 * An id selection lists what it means. A described one sends the question and
 * the exceptions — never the answer.
 */
export function batchSelection(
  selection: Selection,
  query: LibraryQuery,
): BatchSelection {
  if (!selection.all) {
    return { track_ids: [...selection.ids] };
  }
  const excluded = [...selection.excluded];
  return {
    query: {
      q: query.q.trim() || undefined,
      playlist_id: query.playlistId,
      // Sent only when there is one: `scope` is a union with no null member,
      // and an absent key is how "no CuePoint scope" is spelled.
      ...(query.scope ? { scope: query.scope } : {}),
      collection_id: query.collectionId,
      filters: query.filters,
    },
    ...(excluded.length > 0 ? { exclude_track_ids: excluded } : {}),
  };
}

/** The operation as the engine takes it — the target is the renderer's own. */
export function batchOperation(action: BatchAction): BatchOperation {
  // Accepting and rejecting take no value, and the engine refuses one sent.
  if (action.kind === "accept_match" || action.kind === "reject_match") {
    return { kind: action.kind };
  }
  return { kind: action.kind, value: action.value ?? null };
}

function tracks(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "track" : "tracks"}`;
}

/**
 * A rating in the words the rest of the app uses.
 *
 * Only ever asked about a rating that exists: "no rating" is a different
 * sentence in each of the two places that can say it, and neither reaches
 * here. Zero is a rating and says so (DEC-034).
 */
function rating(value: unknown): string {
  const stars = Number(value);
  return stars === 0 ? "zero stars" : starsFor(stars);
}

/**
 * What the confirmation asks, above the threshold.
 *
 * Not because a batch is destructive to tracks — nothing here deletes one —
 * but because "add 47,913 tracks to a Collection" is rarely what somebody
 * meant to click, and there is no undo stack to fall back on (DEC-008).
 */
export function describeBatch(action: BatchAction, count: number): string {
  const many = tracks(count);
  switch (action.kind) {
    case "set_rating":
      return action.value == null
        ? `Clear the CuePoint rating on ${many}?`
        : `Rate ${many} ${rating(action.value)}?`;
    case "set_favorite":
      return action.value
        ? `Favorite ${many}?`
        : `Remove the favorite from ${many}?`;
    case "add_tag":
      return `Tag ${many} “${action.target}”?`;
    case "remove_tag":
      return `Remove the tag “${action.target}” from ${many}?`;
    case "add_to_collection":
      return `Add ${many} to “${action.target}”?`;
    case "remove_from_collection":
      return `Remove ${many} from “${action.target}”?`;
    case "accept_match":
      return `Accept the proposed Beatport match on ${many}?`;
    case "reject_match":
      return `Reject the proposed Beatport match on ${many}?`;
    case "apply_match":
      return `Apply Beatport's ${action.target} to ${many}?`;
    case "set_override":
      return isClearing(action)
        ? `Clear your ${action.target} on ${many}?`
        : `Set the ${action.target} on ${many}?`;
  }
}

/** A hand edit that clears rather than sets. */
function isClearing(action: BatchAction): boolean {
  const edit = action.value as OverrideEdit | undefined;
  return action.kind === "set_override" && edit != null && edit.value === null;
}

/** The verb, once it has happened. */
function pastTense(action: BatchAction): string {
  switch (action.kind) {
    case "set_rating":
      return action.value == null ? "Cleared the rating on" : "Rated";
    case "set_favorite":
      return action.value ? "Favorited" : "Unfavorited";
    case "add_tag":
      return "Tagged";
    case "remove_tag":
      return "Untagged";
    case "add_to_collection":
      return "Added";
    case "remove_from_collection":
      return "Removed";
    case "accept_match":
      return "Accepted the match on";
    case "reject_match":
      return "Rejected the match on";
    case "apply_match":
      return `Applied Beatport's ${action.target} to`;
    case "set_override":
      return isClearing(action) ? `Cleared your ${action.target} on` : `Set the ${action.target} on`;
  }
}

/** Why a track was reached and not changed — a different sentence each time. */
function alreadyWere(action: BatchAction): string {
  switch (action.kind) {
    case "set_rating":
      return action.value == null ? "had no rating" : `were already ${rating(action.value)}`;
    case "set_favorite":
      return action.value ? "were already favorites" : "were not favorites";
    case "add_tag":
      return "already had it";
    case "remove_tag":
      return "did not have it";
    case "add_to_collection":
      return "were already there";
    case "remove_from_collection":
      return "were not in it";
    // A batch decides only what nobody has decided (DEC-067), so a track
    // someone already decided, or one never matched, is left as it was.
    case "accept_match":
    case "reject_match":
      return "were already decided or had nothing proposed";
    case "apply_match":
      return "had no accepted match or already held those values";
    case "set_override":
      return isClearing(action) ? "had none" : "already had it";
  }
}

/** Where the batch went, for a toast that names it. */
function destination(action: BatchAction): string {
  if (action.kind === "add_to_collection") return ` to “${action.target}”`;
  if (action.kind === "remove_from_collection") return ` from “${action.target}”`;
  if (action.kind === "add_tag") return ` “${action.target}”`;
  if (action.kind === "remove_tag") return ` “${action.target}”`;
  return "";
}

/**
 * What happened, in the counts the result carries (ORG-07).
 *
 * `changed` and `unchanged` are different sentences on purpose: "tagged 40
 * tracks (12 already had it)" is true and "tagged 52 tracks" is not.
 */
export function batchSummary(action: BatchAction, result: BatchResult): string {
  const parts: string[] = [];
  if (result.unchanged > 0) {
    parts.push(`${result.unchanged.toLocaleString()} ${alreadyWere(action)}`);
  }
  if (result.failed > 0) {
    parts.push(
      `${result.failed.toLocaleString()} could not be changed`,
    );
  }
  const head = `${pastTense(action)} ${tracks(result.changed)}${destination(action)}`;
  const line = parts.length === 0 ? `${head}.` : `${head} — ${parts.join(", ")}.`;
  const opened = result.cancelled ? `Stopped early. ${line}` : line;
  // No undo stack (DEC-008), but a batch can be reverted as one since CLEAN-13
  // drew the control for it, so the toast says where — except for Collection
  // membership, which records no History and cannot be reverted (DEC-058).
  // Not for a single track, where the toast would be longer than the edit.
  if (result.changed <= 1) return opened;
  return canRevertKind(action.kind)
    ? `${opened} Each change is in the track's History, and the whole batch can be reverted from Activity.`
    : `${opened} There is no undo for Collection changes.`;
}

/**
 * What the confirmation adds under its question (DEC-063, CLEAN-13).
 *
 * The same distinction the toast draws: most batches can be reverted from
 * Activity, and Collection membership cannot.
 */
export function batchConsequence(kind: LibraryBatchKind): string {
  return canRevertKind(kind)
    ? "It runs in the background. Every change is recorded in each track’s History, and the whole batch can be reverted from Activity."
    : "It runs in the background, and there is no undo: adding tracks to or removing them from a Collection cannot be reverted.";
}
