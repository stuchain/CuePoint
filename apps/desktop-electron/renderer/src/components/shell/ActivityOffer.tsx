/**
 * What one Activity entry offers: revert a batch, or restore written tags (CLEAN-13).
 *
 * Both take a second click. Reverting a batch undoes every change it made, and
 * restoring rewrites files, so the entry asks "Revert every change…?" in place
 * rather than acting on the first click. What happened is said in the entry,
 * and anything showing the library is told to read it again.
 *
 * A tag write's entry reads its record first: how many values a restore would
 * put back, and how many of those the engine never saw finish. An unconfirmed
 * write is never shown as done (CLEAN-10).
 */
import { useCallback, useEffect, useState } from "react";

import type {
  ActivityEvent,
  BatchRevertResult,
  TagRestoreResult,
} from "../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../api/libraryChanges";
import { followJob } from "../../screens/library/followJob";
import { jobErrorMessage } from "../../screens/library/libraryFormat";
import { activityOffer, restoredLine, revertedLine, writesLine } from "./activityActions";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** A job's answer, once it has ended. */
async function finishedResult<T>(jobId: string): Promise<T | null> {
  const finished = await followJob(jobId).finished;
  if (finished.state === "failed") throw new Error(jobErrorMessage(finished.error));
  const read = window.cuepoint?.getJobResults;
  if (!read) return null;
  const payload = await read(jobId);
  return (payload.result as T | undefined) ?? null;
}

interface Record_ {
  restorable: number;
  unconfirmed: number;
}

export interface ActivityOfferProps {
  event: ActivityEvent;
  /** Called after an action changed something, so the feed reads again. */
  onDone: () => void;
}

export function ActivityOffer({ event, onDone }: ActivityOfferProps) {
  const offer = activityOffer(event);
  const bridge = window.cuepoint;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [record, setRecord] = useState<Record_ | null>(null);
  /** A batch this entry reverted: it is not offered again from here. */
  const [reverted, setReverted] = useState(false);

  const jobIds = offer?.kind === "restore-tags" ? offer.jobIds.join(",") : "";
  const canRestore = Boolean(bridge?.getTagWrites && bridge.startTagRestore);

  useEffect(() => {
    if (!jobIds || !canRestore) return;
    let cancelled = false;
    void Promise.all(
      jobIds.split(",").map((jobId) => window.cuepoint!.getTagWrites!({ jobId, limit: 1 })),
    )
      .then((records) => {
        if (cancelled) return;
        setRecord({
          restorable: records.reduce((sum, entry) => sum + entry.restorable, 0),
          unconfirmed: records.reduce((sum, entry) => sum + entry.restorable_unconfirmed, 0),
        });
      })
      .catch(() => {
        if (!cancelled) setRecord(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canRestore, jobIds]);

  const revert = useCallback(
    async (batchId: string) => {
      const start = window.cuepoint?.revertBatch;
      if (!start) return;
      setBusy(true);
      setAsking(false);
      try {
        const outcome = await start({ batch_id: batchId });
        let result: BatchRevertResult | null = outcome.reverted ?? null;
        const jobId = outcome.job_id ?? outcome.id;
        if (!result && jobId) result = await finishedResult<BatchRevertResult>(jobId);
        setSaid(revertedLine(result));
        setReverted(true);
        announceLibraryChange();
        onDone();
      } catch (cause) {
        setSaid(messageOf(cause));
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  const restore = useCallback(
    async (ids: readonly string[]) => {
      const start = window.cuepoint?.startTagRestore;
      if (!start) return;
      setBusy(true);
      setAsking(false);
      const results: TagRestoreResult[] = [];
      try {
        // One at a time: restores hold the files, and the engine refuses a
        // second beside the first.
        for (const jobId of ids) {
          const started = await start({ job_id: jobId });
          const result = await finishedResult<TagRestoreResult>(started.job_id);
          if (result) results.push(result);
        }
        setSaid(restoredLine(results));
        setRecord((previous) => (previous ? { restorable: 0, unconfirmed: 0 } : previous));
      } catch (cause) {
        setSaid(messageOf(cause));
      } finally {
        setBusy(false);
        announceLibraryChange();
        onDone();
      }
    },
    [onDone],
  );

  if (!offer) return null;

  if (offer.kind === "revert-batch") {
    if (!bridge?.revertBatch) return null;
    if (offer.disabledReason) {
      return (
        <span className="cp-activity__offer">
          <button type="button" className="cp-activity__action" disabled>
            Revert this batch
          </button>
          <span className="cp-activity__reason">{offer.disabledReason}</span>
        </span>
      );
    }
    return (
      <span className="cp-activity__offer" aria-live="polite">
        {reverted ? null : asking ? (
          <>
            <span>Revert every change this batch made?</span>
            <button
              type="button"
              className="cp-activity__action"
              onClick={() => void revert(offer.batchId)}
            >
              Revert
            </button>
            <button type="button" className="cp-activity__action" onClick={() => setAsking(false)}>
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            className="cp-activity__action"
            disabled={busy}
            onClick={() => setAsking(true)}
          >
            {busy ? "Reverting…" : "Revert this batch"}
          </button>
        )}
        {said && <span className="cp-activity__said">{said}</span>}
      </span>
    );
  }

  if (!canRestore) return null;
  const unfinished = record != null && record.unconfirmed > 0;
  return (
    <span
      className={`cp-activity__offer${unfinished ? " cp-activity__offer--unfinished" : ""}`}
      aria-live="polite"
    >
      {record && <span className="cp-activity__reason">{writesLine(record.restorable, record.unconfirmed)}</span>}
      {record && record.restorable > 0 &&
        (asking ? (
          <>
            <span>Put back every value these writes replaced?</span>
            <button
              type="button"
              className="cp-activity__action"
              onClick={() => void restore(offer.jobIds)}
            >
              Restore
            </button>
            <button type="button" className="cp-activity__action" onClick={() => setAsking(false)}>
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            className="cp-activity__action"
            disabled={busy}
            onClick={() => setAsking(true)}
          >
            {busy ? "Restoring…" : "Restore"}
          </button>
        ))}
      {said && <span className="cp-activity__said">{said}</span>}
    </span>
  );
}
