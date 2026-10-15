/**
 * Ticking and unticking tracks of a review (the Review tab).
 *
 * A tick is the person's decision to sync a track's Beatport values, kept by the engine (ticked is
 * an accepted match, unticked a refused one), so it stays after leaving the tab and after a
 * restart. Nothing is written to a value or a file by it: that is Sync.
 *
 * A tick shows at once and is sent after: the row is patched first, and put back with a warning in
 * words if the engine refuses it, so a silent failure never leaves the table saying what is not so.
 * The header tick names the whole review by its scope, so it holds for every track and not only the
 * rows read; a long one runs as a job and is followed to its end, the table is read again after it,
 * and the batch it was recorded under comes back so it can be taken back (`undo`).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { ReviewTrack } from "../../../api/cuepointBridge.types";
import { useToast } from "../../../components";
import { NEEDS_DESKTOP, userMessage } from "../../../api/userMessage";
import { reportUnexpected } from "../../../reporting/reporting";
import { followJob } from "../../library/followJob";
import { jobErrorMessage } from "../../library/libraryFormat";
import type { ReviewSource } from "./useMatchReview";

/** What the header tick did: how many tracks changed, and the batch that takes it back. */
export interface TickedAll {
  changed: number;
  batchId: string | null;
}

interface ReviewTicks {
  /** A tick is being sent: the header tick waits for it. */
  busy: boolean;
  /** Tick or untick these rows. Resolves to how many changed, or null when the engine refused. */
  setTicked: (rows: readonly ReviewTrack[], ticked: boolean) => Promise<number | null>;
  /** Tick or untick every track of the review that has a match, whatever has been read. Null when refused. */
  setAll: (ticked: boolean) => Promise<TickedAll | null>;
  /** Take back what a header tick did, by the batch it named. True when it went back. */
  undo: (batchId: string) => Promise<boolean>;
}

export function useReviewTicks(
  source: ReviewSource,
  patchTrack: (trackId: number, changes: Partial<ReviewTrack>) => void,
  /** The table must be read again: a change was made to rows this hook cannot name. */
  onReread: () => void,
): ReviewTicks {
  const { push } = useToast();
  const [pending, setPending] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const send = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T | null> => {
      setPending((count) => count + 1);
      try {
        return await work();
      } catch (cause) {
        reportUnexpected(cause);
        push(userMessage(cause), "warning");
        return null;
      } finally {
        if (alive.current) setPending((count) => count - 1);
      }
    },
    [push],
  );

  const setTicked = useCallback(
    async (rows: readonly ReviewTrack[], ticked: boolean) => {
      const changing = rows.filter((row) => row.tickable && row.ticked !== ticked);
      if (changing.length === 0) return 0;
      const bridge = window.cuepoint?.setMatchTicks;
      if (!bridge) {
        push(NEEDS_DESKTOP, "warning");
        return null;
      }
      for (const row of changing) patchTrack(row.track_id, { ticked });
      const answer = await send(() => bridge({ ticked, track_ids: changing.map((row) => row.track_id) }));
      if (!answer) {
        // Put back what the table said before: the engine did not take it.
        for (const row of changing) patchTrack(row.track_id, { ticked: row.ticked });
        return null;
      }
      return answer.changed ?? changing.length;
    },
    [patchTrack, push, send],
  );

  const setAll = useCallback(
    async (ticked: boolean): Promise<TickedAll | null> => {
      const bridge = window.cuepoint?.setMatchTicks;
      if (!bridge) {
        push(NEEDS_DESKTOP, "warning");
        return null;
      }
      const scope = {
        ...(source.jobId ? { job_id: source.jobId } : {}),
        ...(source.playlistId !== undefined ? { playlist_id: source.playlistId } : {}),
      };
      const done = await send(async (): Promise<TickedAll> => {
        const answer = await bridge({ ticked, scope });
        const jobId = answer.job_id ?? answer.id;
        if (!jobId) return { changed: answer.changed ?? 0, batchId: answer.batch_id };
        // Thousands of ticks run as a job: the table is not read again until it has ended.
        const outcome = await followJob(jobId).finished;
        if (outcome.state !== "succeeded") {
          throw new Error(
            outcome.state === "cancelled" ? "Stopped. What was already ticked stays as it is." : jobErrorMessage(outcome.error),
          );
        }
        const result = (await window.cuepoint?.getJobResults?.(jobId).catch(() => null))?.result as
          | { changed?: number; batch_id?: string | null }
          | null
          | undefined;
        return { changed: result?.changed ?? 0, batchId: result?.batch_id ?? answer.batch_id };
      });
      onReread();
      return done;
    },
    [onReread, push, send, source.jobId, source.playlistId],
  );

  const undo = useCallback(
    async (batchId: string) => {
      const bridge = window.cuepoint?.revertBatch;
      if (!bridge) {
        push(NEEDS_DESKTOP, "warning");
        return false;
      }
      const back = await send(async () => {
        const outcome = await bridge({ batch_id: batchId });
        const jobId = outcome.job_id ?? outcome.id;
        if (jobId) {
          const ended = await followJob(jobId).finished;
          if (ended.state !== "succeeded") throw new Error(jobErrorMessage(ended.error));
        }
        return true;
      });
      onReread();
      return back === true;
    },
    [onReread, push, send],
  );

  return { busy: pending > 0, setTicked, setAll, undo };
}
