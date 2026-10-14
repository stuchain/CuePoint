/** The review list's data: paged, filtered by the engine, patched in place, never overtaken. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { MatchReview } from "../../../api/cuepointBridge.types";
import { reviewOf, reviewTrack } from "../../../test/matchFixtures";
import { REVIEW_PAGE, useMatchReview } from "./useMatchReview";

function review(jobId: string | null, overrides: Partial<MatchReview> = {}): MatchReview {
  return { ...reviewOf([reviewTrack(1, "to_check"), reviewTrack(2, "matched")], { job_id: jobId }), ...overrides };
}

let read: ReturnType<typeof vi.fn>;

beforeEach(() => {
  read = vi.fn(async (params?: { jobId?: string }) => review(params?.jobId ?? null));
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getMatchReview: read };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("useMatchReview", () => {
  it("reads a run a page at a time, and a playlist by its id", async () => {
    const run = renderHook(() => useMatchReview({ jobId: "r1" }));
    await waitFor(() => expect(run.result.current.review?.job_id).toBe("r1"));
    expect(read).toHaveBeenCalledWith({ jobId: "r1", limit: REVIEW_PAGE });

    const list = renderHook(() => useMatchReview({ playlistId: 7 }));
    await waitFor(() => expect(list.result.current.review).not.toBeNull());
    expect(read).toHaveBeenLastCalledWith({ playlistId: 7, limit: REVIEW_PAGE });
  });

  it("asks the engine for the filter, keeping the list in view until it answers", async () => {
    const { result, rerender } = renderHook(({ filter }) => useMatchReview({ jobId: "r1" }, 0, filter), {
      initialProps: { filter: "all" as "all" | "not_found" },
    });
    await waitFor(() => expect(result.current.review).not.toBeNull());
    rerender({ filter: "not_found" });
    expect(result.current.review).not.toBeNull();
    await waitFor(() =>
      expect(read).toHaveBeenLastCalledWith({ jobId: "r1", filter: "not_found", limit: REVIEW_PAGE }),
    );
  });

  it("reads nothing without a source", () => {
    const { result } = renderHook(() => useMatchReview(null));
    expect(read).not.toHaveBeenCalled();
    expect(result.current.review).toBeNull();
  });

  it("keeps the list while it is read again on a new version", async () => {
    const { result, rerender } = renderHook(({ version }) => useMatchReview({ jobId: "r1" }, version), {
      initialProps: { version: 0 },
    });
    await waitFor(() => expect(result.current.review).not.toBeNull());
    rerender({ version: 1 });
    expect(result.current.review).not.toBeNull();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it("starts clean for another run", async () => {
    const { result, rerender } = renderHook(({ id }) => useMatchReview({ jobId: id }), {
      initialProps: { id: "r1" },
    });
    await waitFor(() => expect(result.current.review?.job_id).toBe("r1"));
    rerender({ id: "r2" });
    expect(result.current.review).toBeNull();
    await waitFor(() => expect(result.current.review?.job_id).toBe("r2"));
  });

  it("drops an answer to a question no longer asked", async () => {
    let release: (value: MatchReview) => void = () => undefined;
    read.mockImplementationOnce(() => new Promise<MatchReview>((resolve) => (release = resolve)));
    const { result, rerender } = renderHook(({ id }) => useMatchReview({ jobId: id }), {
      initialProps: { id: "slow" },
    });
    rerender({ id: "fast" });
    await waitFor(() => expect(result.current.review?.job_id).toBe("fast"));
    await act(async () => release(review("slow")));
    expect(result.current.review?.job_id).toBe("fast");
  });

  it("reads on when the run holds more than a page, without repeating a track", async () => {
    read.mockImplementation(async (params?: { after?: string }) =>
      params?.after
        ? review("r1", { matching: 3, tracks: [reviewTrack(2, "matched"), reviewTrack(3, "matched")] })
        : review("r1", { matching: 3 }),
    );
    const { result } = renderHook(() => useMatchReview({ jobId: "r1" }));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.review?.tracks.map((row) => row.track_id)).toEqual([1, 2, 3]));
    // Read on from the last row's own cursor, not from a count of rows.
    expect(read).toHaveBeenLastCalledWith({ jobId: "r1", after: "0:2", limit: REVIEW_PAGE });
    expect(result.current.hasMore).toBe(false);
  });

  it("re-reads as many rows as are loaded, so the pages read are not dropped", async () => {
    // The engine answers `limit` rows from the cursor, as the real one does.
    const all = [reviewTrack(1, "to_check"), reviewTrack(2, "matched"), reviewTrack(3, "matched")];
    read.mockImplementation(async (params?: { after?: string; limit?: number }) => {
      const past = params?.after ? Number(params.after.split(":")[1]) : 0;
      const tracks = all.filter((row) => row.track_id > past).slice(0, params?.limit === 2 ? 2 : (params?.limit ?? 99));
      return review("r1", { matching: 3, tracks: params?.after ? tracks : all.slice(0, 2) });
    });
    const { result, rerender } = renderHook(({ version }) => useMatchReview({ jobId: "r1" }, version), {
      initialProps: { version: 0 },
    });
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.review?.tracks).toHaveLength(3));
    rerender({ version: 1 });
    await waitFor(() => expect(read).toHaveBeenLastCalledWith({ jobId: "r1", limit: REVIEW_PAGE }));
    // The list is not emptied while it is read again.
    expect(result.current.review?.tracks.length).toBeGreaterThanOrEqual(2);
  });

  it("patches a decision in place: the row and the counts move, with no second read", async () => {
    const { result } = renderHook(() => useMatchReview({ jobId: "r1" }));
    await waitFor(() => expect(result.current.review).not.toBeNull());
    act(() =>
      result.current.patchTrack(1, { status: "done", decision: "rejected", undo_batch: null, disputed: false }),
    );
    const { counts, tracks, rejected } = result.current.review!;
    expect(counts).toMatchObject({ to_check: 0, matched: 1, done: 1 });
    expect(rejected).toBe(1);
    expect(tracks[0]).toMatchObject({ track_id: 1, status: "done", decision: "rejected" });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("says why when the read fails, and when the build has no route", async () => {
    read.mockRejectedValueOnce(new Error("boom"));
    const failing = renderHook(() => useMatchReview({ jobId: "r1" }));
    await waitFor(() => expect(failing.result.current.error).not.toBeNull());

    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    const missing = renderHook(() => useMatchReview({ jobId: "r1" }));
    await waitFor(() => expect(missing.result.current.error).toBe("This needs the CuePoint desktop app."));
  });
});
