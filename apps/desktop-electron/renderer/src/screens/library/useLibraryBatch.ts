/**
 * Running one batch edit (ORG-11, DEC-045, DEC-063).
 *
 * Every organization action on this page comes through here, whether it was
 * asked for by a menu, by the toolbar, or by dropping rows on a Collection.
 * One entry point, because the two things that are easy to get wrong — the
 * confirmation above the threshold, and reading a job's counts back — are
 * things every caller would otherwise have its own version of.
 *
 * **The threshold is the engine's.** Above it the engine forks a job; above it
 * this asks first. The same number for both, so a confirmation is never shown
 * for work that finished on the request thread, and a 47,913-track edit is
 * never started without being asked about. `libraryBatch.ts` holds the number
 * and a test holds it to the engine's.
 *
 * **A confirmation is not a warning about damage.** Nothing here deletes a
 * track. It is a warning about *scale*: "add 47,913 tracks to a Collection" is
 * rarely what somebody meant to click, and DEC-008 chose history over an undo
 * stack, so the way back is reading what happened rather than reversing it.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { BatchResult, BatchSelection } from "../../api/cuepointBridge.types";
import { followJob } from "./followJob";
import { jobErrorMessage } from "./libraryFormat";
import {
  BATCH_JOB_THRESHOLD,
  batchOperation,
  batchSummary,
  describeBatch,
  type BatchAction,
} from "./libraryBatch";

/** One batch, ready to run: what to do, to which tracks, and how many. */
export interface BatchRun {
  action: BatchAction;
  selection: BatchSelection;
  count: number;
}

export interface LibraryBatchController {
  /** The batch waiting to be confirmed, or null. */
  pending: BatchRun | null;
  /** The question the confirmation asks, or null when nothing is pending. */
  question: string | null;
  /** True while a batch is being applied or followed. */
  busy: boolean;
  /** Ask for a batch. Confirms first when it is large enough to be a job. */
  start: (run: BatchRun) => Promise<void>;
  /** Run the pending batch. */
  confirm: () => Promise<void>;
  /** Drop it. */
  cancel: () => void;
}

export interface LibraryBatchOptions {
  onMessage: (message: string, tone: "info" | "success" | "warning") => void;
  /**
   * Called after a batch the engine accepted, however it ran.
   *
   * What it does is the page's business: re-read the table, reload the tree,
   * re-read the Inspector. It is called for a cancelled batch too, because a
   * batch that stopped halfway still changed everything it reached.
   */
  onApplied: () => void;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useLibraryBatch({
  onMessage,
  onApplied,
}: LibraryBatchOptions): LibraryBatchController {
  const [pending, setPending] = useState<BatchRun | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const following = useRef<{ stop: () => void }[]>([]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const handle of following.current) handle.stop();
      following.current = [];
    };
  }, []);

  const apply = useCallback(
    async (run: BatchRun) => {
      const bridge = window.cuepoint?.applyBatch;
      if (!bridge) {
        onMessage("Editing tracks needs the desktop app with the engine connected.", "warning");
        return;
      }

      setBusy(true);
      let outcome;
      try {
        outcome = await bridge({
          selection: run.selection,
          operation: batchOperation(run.action),
        });
      } catch (cause) {
        if (alive.current) setBusy(false);
        onMessage(messageOf(cause), "warning");
        return;
      }

      // Applied on the request thread: the counts are already here.
      if (outcome.applied) {
        if (alive.current) setBusy(false);
        onMessage(batchSummary(run.action, outcome.applied), "success");
        onApplied();
        return;
      }

      const jobId = outcome.job_id ?? outcome.id;
      if (!jobId) {
        if (alive.current) setBusy(false);
        onMessage("The engine answered without counts and without a job.", "warning");
        return;
      }

      // Progress belongs to the status strip (SHELL-07), which is already
      // showing this job. What is waited for here is the *result*, because the
      // counts are what the toast is made of.
      const handle = followJob(jobId);
      following.current.push(handle);
      const finished = await handle.finished;
      following.current = following.current.filter((entry) => entry !== handle);
      if (alive.current) setBusy(false);

      if (finished.state !== "succeeded") {
        onMessage(jobErrorMessage(finished.error), "warning");
        // A failed batch still changed whatever it reached before it failed,
        // so the page re-reads rather than trusting what is on screen.
        onApplied();
        return;
      }

      const results = window.cuepoint?.getJobResults;
      if (!results) {
        onMessage("Done.", "success");
        onApplied();
        return;
      }
      try {
        const payload = await results(jobId);
        const counts = payload.result as BatchResult | undefined;
        onMessage(
          counts ? batchSummary(run.action, counts) : "Done.",
          "success",
        );
      } catch {
        // The batch succeeded; not being able to read its receipt is not a
        // failure worth reporting as one.
        onMessage("Done.", "success");
      }
      onApplied();
    },
    [onApplied, onMessage],
  );

  const start = useCallback(
    async (run: BatchRun) => {
      if (run.count > BATCH_JOB_THRESHOLD) {
        setPending(run);
        return;
      }
      await apply(run);
    },
    [apply],
  );

  const confirm = useCallback(async () => {
    const run = pending;
    setPending(null);
    if (run) await apply(run);
  }, [apply, pending]);

  const cancel = useCallback(() => setPending(null), []);

  return {
    pending,
    question: pending ? describeBatch(pending.action, pending.count) : null,
    busy,
    start,
    confirm,
    cancel,
  };
}
