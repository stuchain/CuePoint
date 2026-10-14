/**
 * The decisions a review makes, one per click (the Review tab).
 *
 * **Correct** accepts the match and copies the ticked values as one act (DEC-004, amended): one
 * batch, so **Undo** can take back exactly that. **Not this track** and **Leave unmatched** are
 * the same refusal, said in the words of the row they are on. **Confirm all** is Correct for many
 * tracks as one batch, and says so with an Undo in its toast. Nothing is written to the audio
 * files by any of them: that is Save, in its own window.
 *
 * **Undo always has the batch to revert**: the engine names the batch behind each track's last
 * decision (`undo_batch`), so Undo takes back the values too after leaving the tab, after Accept
 * all, after a restart. A batch can cover many tracks (Confirm all, Correct N selected), so a row's
 * Undo reverts **only that track's** part of it; the toast after the batch undoes the whole batch,
 * and says so ("Undo confirming 13"). A decision with no batch (a refusal) is undone by clearing it.
 *
 * A job (a big batch, a big revert) is followed to its end and a failure is said in words: a
 * silent failure would leave the person believing it was done.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { CorrectField } from "../../../api/cuepointBridge.types";
import { useToast } from "../../../components";
import { NEEDS_DESKTOP, userMessage } from "../../../api/userMessage";
import { reportUnexpected } from "../../../reporting/reporting";
import { followJob, type FinishedJob } from "../../library/followJob";
import { jobErrorMessage } from "../../library/libraryFormat";
import { correctedManyLine } from "../cleanFormat";
import { CARD_FIELDS, type CardField } from "./matchCard";

interface ReviewDecisions {
  /** A decision is being sent. */
  busy: boolean;
  /** Correct: accept this candidate for the track and copy the ticked values; the batch that undoes it. */
  correct: (trackId: number, candidateId: number) => Promise<{ batchId: string | null } | null>;
  /** Not this track, or Leave unmatched: no candidate is this track. */
  reject: (trackId: number) => Promise<boolean>;
  /** Undo one track's decision: revert that track's part of its batch when it has one, else clear it. */
  undo: (trackId: number, batchId: string | null) => Promise<boolean>;
  /** Correct many tracks as one batch; its toast offers Undo. True when it went through. */
  acceptMany: (trackIds: number[]) => Promise<boolean>;
}

export function useReviewDecisions(
  ticks: ReadonlySet<CardField>,
  /** The list must be read again: a batch or an undo changed rows this hook cannot name. */
  onReread: () => void,
): ReviewDecisions {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const reread = useRef(onReread);
  reread.current = onReread;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fields = useCallback(
    () => CARD_FIELDS.filter((field): field is CorrectField => field !== "key" && ticks.has(field)),
    [ticks],
  );

  /** One act: busy while it runs, a warning in words when it fails. */
  const act = useCallback(
    async <T>(work: () => Promise<T>): Promise<T | null> => {
      setBusy(true);
      try {
        return await work();
      } catch (cause) {
        reportUnexpected(cause);
        push(userMessage(cause), "warning");
        return null;
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [push],
  );

  /** A job's end, said in words when it failed. True when it succeeded. */
  const said = useCallback(
    (outcome: FinishedJob): boolean => {
      if (outcome.state === "succeeded") return true;
      if (outcome.state === "cancelled") push("Stopped. What it had already done stays done.", "info");
      else push(jobErrorMessage(outcome.error), "warning");
      return false;
    },
    [push],
  );

  const revert = useCallback(
    async (batchId: string, trackId?: number): Promise<boolean> => {
      const bridge = window.cuepoint?.revertBatch;
      if (!bridge) throw new Error(NEEDS_DESKTOP);
      const outcome = await bridge({ batch_id: batchId, ...(trackId !== undefined ? { track_id: trackId } : {}) });
      const jobId = outcome.job_id ?? outcome.id;
      // The values are back only once the job has run.
      return jobId ? said(await followJob(jobId).finished) : true;
    },
    [said],
  );

  const correct = useCallback(
    (trackId: number, candidateId: number) =>
      act(async () => {
        const bridge = window.cuepoint?.correctMatch;
        if (!bridge) throw new Error(NEEDS_DESKTOP);
        const outcome = await bridge({
          track_id: trackId,
          candidate_id: candidateId,
          fields: fields(),
          ...(ticks.has("key") ? { replace_key: true } : {}),
        });
        return { batchId: outcome.batch_id ?? null };
      }),
    [act, fields, ticks],
  );

  const reject = useCallback(
    async (trackId: number) =>
      (await act(async () => {
        const bridge = window.cuepoint?.decideMatch;
        if (!bridge) throw new Error(NEEDS_DESKTOP);
        await bridge({ decision: "reject", track_id: trackId });
        return true;
      })) === true,
    [act],
  );

  const undo = useCallback(
    async (trackId: number, batchId: string | null) => {
      const done = await act(async () => {
        if (batchId) return revert(batchId, trackId);
        const decide = window.cuepoint?.decideMatch;
        if (!decide) throw new Error(NEEDS_DESKTOP);
        await decide({ decision: "clear", track_id: trackId });
        return true;
      });
      reread.current();
      return done === true;
    },
    [act, revert],
  );

  const acceptMany = useCallback(
    async (trackIds: number[]) => {
      const done = await act(async () => {
        const bridge = window.cuepoint?.correctMatches;
        if (!bridge) throw new Error(NEEDS_DESKTOP);
        const outcome = await bridge({
          selection: { track_ids: trackIds },
          fields: fields(),
          ...(ticks.has("key") ? { replace_key: true } : {}),
        });
        const jobId = outcome.job_id ?? outcome.id;
        let batchId = outcome.applied?.batch_id ?? null;
        let changed = outcome.applied?.changed ?? trackIds.length;
        if (jobId) {
          push("Working in the background. The bar at the bottom shows progress.", "info");
          if (!said(await followJob(jobId).finished)) return false;
          // A big batch ran as a job: its batch is in its result, and is as undoable as a small one.
          const result = (await window.cuepoint?.getJobResults?.(jobId).catch(() => null))?.result as
            | { batch_id?: string; changed?: number }
            | null
            | undefined;
          batchId = result?.batch_id ?? null;
          changed = result?.changed ?? changed;
        }
        push(
          correctedManyLine(changed),
          "success",
          batchId
            ? {
                label: `Undo confirming ${changed.toLocaleString()}`,
                onClick: () => {
                  // The whole batch: every track it covered.
                  void act(() => revert(batchId!)).then(() => reread.current());
                },
              }
            : undefined,
        );
        return true;
      });
      reread.current();
      return done === true;
    },
    [act, fields, push, revert, said, ticks],
  );

  return { busy, correct, reject, undo, acceptMany };
}
