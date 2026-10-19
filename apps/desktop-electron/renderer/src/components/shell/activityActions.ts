/**
 * What an Activity entry offers, as pure functions (CLEAN-13).
 *
 * The feed is where a batch and a tag write are recorded as one thing, so it
 * is where "revert this batch" and "restore these files" belong — and, since
 * CLEAN-14, "resume this match" for one CuePoint's closing cut short. What each
 * entry offers is decided from what the engine recorded in it; whether the
 * action is allowed is still the engine's answer — except Collection
 * membership, whose refusal never varies and is drawn as a disabled control
 * with its reason rather than a button whose only outcome is an error.
 */
import { countNoun, formatCount } from "../../format/counts";
import type {
  ActivityEvent,
  BatchRevertResult,
  TagRestoreResult,
} from "../../api/cuepointBridge.types";

/** The batch operations a revert refuses, and why (DEC-058, CLEAN-06). */
const MEMBERSHIP_OPERATIONS: ReadonlySet<string> = new Set([
  "add_to_collection",
  "remove_from_collection",
]);

/**
 * Said for both kinds of node that hold tracks: the batch operation is the
 * same for a Collection and a Set (DEC-102), and the feed does not record
 * which one it was, so the sentence names both rather than guessing.
 */
export const MEMBERSHIP_REVERT_REASON =
  "Adding tracks to or removing them from a Collection or a Set cannot be undone: tracks hold positions that later edits move. Add or remove them again instead.";

/** The activity events a batch records: one applied, one reverted (DEC-063). */
const BATCH_EVENTS: ReadonlySet<string> = new Set(["library.batch", "library.batch_reverted"]);

/** The activity events a tag write leaves: written, and stopped part way. */
const TAG_WRITE_EVENT = "clean.tags.written";
const TAG_INTERRUPTED_EVENT = "clean.tags.interrupted";

/** The activity event a match leaves when CuePoint closed before it finished (DEC-065). */
const MATCH_INTERRUPTED_EVENT = "clean.match.interrupted";

/** What an activity entry offers, if anything. */
type ActivityOffer =
  | { kind: "revert-batch"; batchId: string; disabledReason: string | null }
  | { kind: "restore-tags"; jobIds: string[]; interrupted: boolean }
  | { kind: "resume-match"; jobId: string }
  | null;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function activityOffer(event: ActivityEvent): ActivityOffer {
  const detail = event.detail ?? {};
  if (BATCH_EVENTS.has(event.type)) {
    const batchId = text(detail.batch_id);
    if (!batchId) return null;
    const operation = text(detail.operation);
    if (operation && MEMBERSHIP_OPERATIONS.has(operation)) {
      return { kind: "revert-batch", batchId, disabledReason: MEMBERSHIP_REVERT_REASON };
    }
    const changed = detail.changed;
    if (typeof changed === "number" && changed <= 0) {
      return { kind: "revert-batch", batchId, disabledReason: "It changed nothing, so there is nothing to undo." };
    }
    return { kind: "revert-batch", batchId, disabledReason: null };
  }
  if (event.type === TAG_WRITE_EVENT) {
    const jobId = text(detail.job_id);
    return jobId ? { kind: "restore-tags", jobIds: [jobId], interrupted: false } : null;
  }
  if (event.type === TAG_INTERRUPTED_EVENT) {
    const ids = Array.isArray(detail.write_job_ids)
      ? detail.write_job_ids.filter((id): id is string => text(id) !== null)
      : [];
    return ids.length > 0 ? { kind: "restore-tags", jobIds: ids, interrupted: true } : null;
  }
  if (event.type === MATCH_INTERRUPTED_EVENT) {
    const jobId = text(detail.job_id);
    return jobId ? { kind: "resume-match", jobId } : null;
  }
  return null;
}

/**
 * What resuming started, or why the entry offers nothing now.
 *
 * `remaining` is null when the match can no longer be resumed — it was resumed
 * already, from here or from the Clean page.
 */
export function resumeOfferLine(remaining: number | null): string {
  if (remaining == null) return "Nothing is left to resume.";
  return `${countNoun(remaining, "track")} left to match.`;
}

// --------------------------------------------------- unconfirmed writes

/**
 * What a record of tag writes says, never calling an unconfirmed write done.
 *
 * `restorable` counts writes a restore would undo; `unconfirmed` the ones of
 * those the engine never saw finish (CLEAN-10, CLEAN-11).
 */
export function writesLine(restorable: number, unconfirmed: number): string {
  if (restorable <= 0) return "Everything synced to files has been undone.";
  const confirmed = restorable - unconfirmed;
  if (unconfirmed <= 0) {
    return `${countNoun(confirmed, "value")} synced to files can be undone.`;
  }
  const unfinished = `${countNoun(unconfirmed, "sync")} may not have finished`;
  return confirmed > 0
    ? `${unfinished}, and ${countNoun(confirmed, "value")} ${confirmed === 1 ? "was" : "were"} synced. Undoing the sync puts every one back as it was.`
    : `${unfinished}. Undoing the sync puts every one back as it was; a file still holding its old value counts as undone.`;
}

/** What a batch revert did, in its counts. */
export function revertedLine(result: BatchRevertResult | null): string {
  if (!result) return "Undone.";
  const parts = [`Undid ${countNoun(result.changed, "change")}`];
  if (result.skipped > 0) parts.push(`${formatCount(result.skipped)} skipped because the value changed since`);
  if (result.unchanged > 0) parts.push(`${formatCount(result.unchanged)} already in place`);
  if (result.failed > 0) parts.push(`${formatCount(result.failed)} could not be undone`);
  const line = `${parts.join(", ")}.`;
  return result.cancelled ? `Stopped early. ${line}` : line;
}

/** What one or more tag restores did, together. */
export function restoredLine(results: readonly TagRestoreResult[]): string {
  const files = results.reduce((sum, result) => sum + result.files, 0);
  const skipped = results.reduce((sum, result) => sum + result.skipped, 0);
  const failed = results.reduce((sum, result) => sum + result.failed, 0);
  const parts = [`Undid ${countNoun(files, "file")}`];
  if (skipped > 0) parts.push(`${formatCount(skipped)} values left alone because the file changed since`);
  if (failed > 0) parts.push(`${formatCount(failed)} could not be undone`);
  return `${parts.join(", ")}.`;
}
