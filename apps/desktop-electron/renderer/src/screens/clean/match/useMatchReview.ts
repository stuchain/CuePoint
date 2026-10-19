/**
 * The review table's data: the tracks of one run (or playlist), read from the engine in pages.
 *
 * One read of `getMatchReview` for a source, read again when `version` changes (a match ended,
 * a candidate was chosen), and read further with `loadMore` when the review holds more tracks than
 * a page. Rows come in plan order and a tick never moves one. The counts are for every track,
 * whatever the page holds.
 *
 * Paging is by **cursor**, not by offset: each row carries its own place in the order, so reading
 * on after the last row never skips a track. A re-read asks for as many rows as are loaded, so it
 * neither drops the pages read nor moves the table under the person. The table stays as it was
 * while it is read again, so nothing flashes empty; a different source starts clean. A tick is
 * **patched in place** (`patchTrack`) instead of reading the whole table again: the row and the
 * counts move at once, and the next read, whenever it is, says the same. An answer to a question
 * no longer asked is dropped.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { MatchReview, ReviewTrack } from "../../../api/cuepointBridge.types";
import { reportUnexpected } from "../../../reporting/reporting";
import { needsDesktopApp, userMessage } from "../../../api/userMessage";

/** What is reviewed: one run, one playlist, or (with neither) every matched track. */
export interface ReviewSource {
  jobId?: string;
  playlistId?: number;
}

/** Tracks one read holds; a review with more is read on, a page at a time. */
export const REVIEW_PAGE = 2000;
/** The most the engine answers in one read: a re-read of more loaded rows than this reads this many. */
export const REVIEW_MAX = 20000;

export interface MatchReviewState {
  review: MatchReview | null;
  /** True until the first answer for this source. */
  loading: boolean;
  error: string | null;
  /** Tracks that have not been read yet. */
  hasMore: boolean;
  /** Read the next page (the arrows reach the end of what is loaded). */
  loadMore: () => void;
  /** Show all N: read every page that is left. */
  loadAll: () => void;
  /** A tick or a search result: change one row, and the counts with it, without reading again. */
  patchTrack: (trackId: number, changes: Partial<ReviewTrack>) => void;
}

function bump(counts: MatchReview["counts"], status: ReviewTrack["status"], by: number) {
  return { ...counts, [status]: Math.max(0, counts[status] + by) };
}

export function useMatchReview(source: ReviewSource | null, version = 0): MatchReviewState {
  const [review, setReview] = useState<MatchReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = useRef<string | null>(null);

  const jobId = source?.jobId;
  const playlistId = source?.playlistId;
  // The table starts clean for another source and stays in view while the same one is read again.
  const wanted = source ? `${jobId ?? ""}|${playlistId ?? ""}` : null;

  const read = useCallback(
    (after: string | null, limit: number) => {
      const bridge = window.cuepoint?.getMatchReview;
      if (!bridge) return null;
      return bridge({
        ...(jobId ? { jobId } : {}),
        ...(playlistId !== undefined ? { playlistId } : {}),
        ...(after ? { after } : {}),
        limit,
      });
    },
    [jobId, playlistId],
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
      setError(needsDesktopApp());
      return;
    }
    let cancelled = false;
    if (asked.current !== wanted) {
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
  }, [wanted, read, version]);

  const loaded = review?.tracks.length ?? 0;
  loadedRows.current = loaded;
  const hasMore = review !== null && loaded < review.total;

  const loadMore = useCallback(() => {
    const last = review?.tracks[loaded - 1];
    const answer = review && last && loaded < review.total ? read(last.cursor, REVIEW_PAGE) : null;
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

  const reading = useRef(false);
  const loadAll = useCallback(() => {
    // A second press while the pages are coming does not start a second reader.
    if (!review || reading.current) return;
    reading.current = true;
    const key = asked.current;
    const total = review.total;
    void (async () => {
      let have = review.tracks.length;
      let cursor = review.tracks[have - 1]?.cursor ?? null;
      while (have < total && cursor) {
        const answer = read(cursor, REVIEW_PAGE);
        if (!answer) return;
        const next = await answer;
        if (asked.current !== key || next.tracks.length === 0) return;
        setReview((current) => {
          if (!current) return next;
          const seen = new Set(current.tracks.map((row) => row.track_id));
          return { ...next, tracks: [...current.tracks, ...next.tracks.filter((row) => !seen.has(row.track_id))] };
        });
        have += next.tracks.length;
        cursor = next.tracks[next.tracks.length - 1]?.cursor ?? null;
      }
    })().catch((cause: unknown) => {
      reportUnexpected(cause);
      setError(userMessage(cause));
    }).finally(() => {
      reading.current = false;
    });
  }, [read, review]);

  const patchTrack = useCallback((trackId: number, changes: Partial<ReviewTrack>) => {
    setReview((current) => {
      if (!current) return current;
      const before = current.tracks.find((row) => row.track_id === trackId);
      if (!before) return current;
      const after = { ...before, ...changes };
      let counts = current.counts;
      if (after.status !== before.status) counts = bump(bump(counts, before.status, -1), after.status, 1);
      const ticked = current.ticked + (after.ticked ? 1 : 0) - (before.ticked ? 1 : 0);
      return {
        ...current,
        counts,
        ticked: Math.max(0, ticked),
        tracks: current.tracks.map((row) => (row.track_id === trackId ? after : row)),
      };
    });
  }, []);

  return { review, loading, error, hasMore, loadMore, loadAll, patchTrack };
}
