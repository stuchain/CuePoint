/**
 * What an Activity entry offers, as pure functions (CLEAN-13).
 *
 * The feed is where a batch and a tag write are recorded as one thing, so it
 * is where "revert this batch" and "restore these files" belong. What each
 * entry offers is decided from what the engine recorded in it; whether the
 * action is allowed is still the engine's answer — except Collection
 * membership, whose refusal never varies and is drawn as a disabled control
 * with its reason rather than a button whose only outcome is an error.
 */
import type {
  ActivityEvent,
  BatchRevertResult,
  TagRestoreResult,
} from "../../api/cuepointBridge.types";

/** The batch operations a revert refuses, and why (DEC-058, CLEAN-06). */
export const MEMBERSHIP_OPERATIONS: ReadonlySet<string> = new Set([
  "add_to_collection",
  "remove_from_collection",
]);

export const MEMBERSHIP_REVERT_REASON =
  "Adding tracks to or removing them from a Collection cannot be reverted: tracks hold positions that later edits move. Add or remove them again instead.";

/** The activity events a batch records: one applied, one reverted (DEC-063). */
export const BATCH_EVENTS: ReadonlySet<string> = new Set(["library.batch", "library.batch_reverted"]);

/** The activity events a tag write leaves: written, and stopped part way. */
export const TAG_WRITE_EVENT = "clean.tags.written";
export const TAG_INTERRUPTED_EVENT = "clean.tags.interrupted";

/** What an activity entry offers, if anything. */
export type ActivityOffer =
  | { kind: "revert-batch"; batchId: string; disabledReason: string | null }
  | { kind: "restore-tags"; jobIds: string[]; interrupted: boolean }
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
      return { kind: "revert-batch", batchId, disabledReason: "It changed nothing, so there is nothing to revert." };
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
  return null;
}

// --------------------------------------------------- unconfirmed writes

function count(number: number, noun: string): string {
  return `${number.toLocaleString()} ${noun}${number === 1 ? "" : "s"}`;
}

/**
 * What a record of tag writes says, never calling an unconfirmed write done.
 *
 * `restorable` counts writes a restore would undo; `unconfirmed` the ones of
 * those the engine never saw finish (CLEAN-10, CLEAN-11).
 */
export function writesLine(restorable: number, unconfirmed: number): string {
  if (restorable <= 0) return "Everything written here has been restored.";
  const confirmed = restorable - unconfirmed;
  if (unconfirmed <= 0) {
    return `${count(confirmed, "value")} written to files can be restored.`;
  }
  const unfinished = `${count(unconfirmed, "write")} may not have finished`;
  return confirmed > 0
    ? `${unfinished}, and ${count(confirmed, "value")} ${confirmed === 1 ? "was" : "were"} written. Restore puts every file back.`
    : `${unfinished}. Restore puts every file back; a file still holding its old value counts as restored.`;
}

/** What a restore started, and what it covers. */
export function restoreStartedLine(writes: number, unconfirmed: number): string {
  const head = `Restoring ${count(writes, "value")}.`;
  return unconfirmed > 0 ? `${head} ${count(unconfirmed, "write")} may not have finished; a file that still holds its old value is left as it is.` : head;
}

/** What a batch revert did, in its counts. */
export function revertedLine(result: BatchRevertResult | null): string {
  if (!result) return "Reverted.";
  const parts = [`Reverted ${count(result.changed, "change")}`];
  if (result.skipped > 0) parts.push(`${result.skipped.toLocaleString()} skipped because the value changed since`);
  if (result.unchanged > 0) parts.push(`${result.unchanged.toLocaleString()} already in place`);
  if (result.failed > 0) parts.push(`${result.failed.toLocaleString()} could not be reverted`);
  const line = `${parts.join(", ")}.`;
  return result.cancelled ? `Stopped early. ${line}` : line;
}

/** What one or more tag restores did, together. */
export function restoredLine(results: readonly TagRestoreResult[]): string {
  const files = results.reduce((sum, result) => sum + result.files, 0);
  const skipped = results.reduce((sum, result) => sum + result.skipped, 0);
  const failed = results.reduce((sum, result) => sum + result.failed, 0);
  const parts = [`Restored ${count(files, "file")}`];
  if (skipped > 0) parts.push(`${skipped.toLocaleString()} values left alone because the file changed since`);
  if (failed > 0) parts.push(`${failed.toLocaleString()} could not be restored`);
  return `${parts.join(", ")}.`;
}
