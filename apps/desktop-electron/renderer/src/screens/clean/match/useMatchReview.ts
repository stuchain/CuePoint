/**
 * The review list's data: the tracks of one run (or playlist), read from the engine in pages.
 *
 * One read of `getMatchReview` for a source and a filter, read again when `version` changes (a
 * match ended, the person undid something), and read further with `loadMore` when the run holds
 * more tracks than a page. Tracks still to look at come first from the engine, so the first page
 * is the useful one. The counts are for every track of the run, whatever the page holds.
 *
 * Paging is by **cursor**, not by offset: the order changes as tracks are decided, and each row
 * carries its own place in it, so reading on after the last row never skips a track decided
 * meanwhile. A re-read asks for as many rows as are loaded, so it neither drops the pages read nor
 * moves the list under the person. The list stays as it was while it is read again, so nothing
 * flashes empty; a different source or filter starts clean. A decision is **patched in place** (`patchTrack`) instead of reading the
 * whole list again: the row and the counts move at once, and the next read, whenever it is, says
 * the same. An answer to a question no longer asked is dropped.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { MatchReview, MatchReviewFilter, ReviewTrack } from "../../../api/cuepointBridge.types";
import { reportUnexpected } from "../../../reporting/reporting";
import { NEEDS_DESKTOP, userMessage } from "../../../api/userMessage";

/** What is reviewed: one run, one playlist, or (with neither) every matched track. */
export interface ReviewSource {
  jobId?: string;
  playlistId?: number;
}

/** Tracks one read holds; a run with more is read on, a page at a time. */
export const REVIEW_PAGE = 2000;
/** The most the engine answers in one read: a re-read of more loaded rows than this reads this many. */
export const REVIEW_MAX = 20000;

export interface MatchReviewState {
  review: MatchReview | null;
  /** True until the first answer for this source. */
  loading: boolean;
  error: string | null;
  /** Tracks the filter holds that have not been read yet. */
  hasMore: boolean;
  loadMore: () => void;
  /** A decision made: change one row, and the counts with it, without reading again. */
  patchTrack: (trackId: number, changes: Partial<ReviewTrack>) => void;
}

function bump(counts: MatchReview["counts"], status: ReviewTrack["status"], by: number) {
  return { ...counts, [status]: Math.max(0, counts[status] + by) };
}

export function useMatchReview(
  source: ReviewSource | null,
  version = 0,
  filter: MatchReviewFilter = "all",
): MatchReviewState {
  const [review, setReview] = useState<MatchReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef<string | null>(null);

  const jobId = source?.jobId;
  const playlistId = source?.playlistId;
  const wanted = source ? `${jobId ?? ""}|${playlistId ?? ""}|${filter}` : null;
  // The list starts clean for another run; a new filter keeps it in view until the engine answers.
  const sourceKey = source ? `${jobId ?? ""}|${playlistId ?? ""}` : null;

  const read = useCallback(
    (after: string | null, limit: number) => {
      const bridge = window.cuepoint?.getMatchReview;
      if (!bridge) return null;
      return bridge({
        ...(jobId ? { jobId } : {}),
        ...(playlistId !== undefined ? { playlistId } : {}),
        ...(filter !== "all" ? { filter } : {}),
        ...(after ? { after } : {}),
        limit,
      });
    },
    [filter, jobId, playlistId],
  );
  // How many rows are loaded, for a re-read to ask for as many.
  const loadedRows = useRef(0);

  useEffect(() => {
    if (wanted === null) {
      asked.current = null;
      setReview(null);
      setError(null);
      setLoading(false);
      return;
    }
    const answer = read(null, Math.min(REVIEW_MAX, Math.max(REVIEW_PAGE, loadedRows.current)));
    if (!answer) {
      setReview(null);
      setError(NEEDS_DESKTOP);
      return;
    }
    let cancelled = false;
    if (asked.current?.split("|").slice(0, 2).join("|") !== sourceKey) {
      setReview(null);
      setLoading(true);
    }
    asked.current = wanted;
    answer
      .then((next) => {
        if (cancelled) return;
        setReview(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (!cancelled) setError(userMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted, sourceKey, read, version]);

  const loaded = review?.tracks.length ?? 0;
  loadedRows.current = loaded;
  const hasMore = review !== null && loaded < review.matching;

  const loadMore = useCallback(() => {
    const last = review?.tracks[loaded - 1];
    const answer = review && last && loaded < review.matching ? read(last.cursor, REVIEW_PAGE) : null;
    const key = asked.current;
    if (!answer) return;
    answer
      .then((next) => {
        if (asked.current !== key) return;
        setReview((current) => {
          if (!current) return next;
          const have = new Set(current.tracks.map((row) => row.track_id));
          return { ...next, tracks: [...current.tracks, ...next.tracks.filter((row) => !have.has(row.track_id))] };
        });
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        setError(userMessage(cause));
      });
  }, [loaded, read, review]);

  const patchTrack = useCallback((trackId: number, changes: Partial<ReviewTrack>) => {
    setReview((current) => {
      if (!current) return current;
      const before = current.tracks.find((row) => row.track_id === trackId);
      if (!before) return current;
      const after = { ...before, ...changes };
      let counts = current.counts;
      if (after.status !== before.status) counts = bump(bump(counts, before.status, -1), after.status, 1);
      const rejected =
        current.rejected + (after.decision === "rejected" ? 1 : 0) - (before.decision === "rejected" ? 1 : 0);
      const disputed = current.disputed + (after.disputed ? 1 : 0) - (before.disputed ? 1 : 0);
      return {
        ...current,
        counts,
        rejected: Math.max(0, rejected),
        disputed: Math.max(0, disputed),
        tracks: current.tracks.map((row) => (row.track_id === trackId ? after : row)),
      };
    });
  }, []);

  return { review, loading, error, hasMore, loadMore, patchTrack };
}
