/** Ticking tracks of a review: shown at once, sent after, and put back in words when refused. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { ToastProvider } from "../../../components";
import { reviewTrack } from "../../../test/matchFixtures";
import { useReviewTicks } from "./useReviewTicks";

let set: ReturnType<typeof vi.fn>;
let patch: ReturnType<typeof vi.fn>;
let reread: ReturnType<typeof vi.fn>;

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

function hook(source = { playlistId: 7 } as { jobId?: string; playlistId?: number }) {
  return renderHook(() => useReviewTicks(source, patch as never, reread as never), { wrapper });
}

beforeEach(() => {
  set = vi.fn().mockResolvedValue({ ticked: false, changed: 2, skipped: 0, batch_id: "b" });
  patch = vi.fn();
  reread = vi.fn();
  (window as unknown as { cuepoint?: unknown }).cuepoint = { setMatchTicks: set };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("setTicked", () => {
  it("patches the rows at once and sends only those that change", async () => {
    const { result } = hook();
    const rows = [reviewTrack(1, "matched"), reviewTrack(2, "matched", { ticked: false }), reviewTrack(3, "not_found")];
    let changed: number | null = null;
    await act(async () => {
      changed = await result.current.setTicked(rows, false);
    });
    // Row 2 is already out and row 3 has no match to tick: only row 1 is sent.
    expect(set).toHaveBeenCalledWith({ ticked: false, track_ids: [1] });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith(1, { ticked: false });
    expect(changed).toBe(2);
  });

  it("sends nothing when nothing changes", async () => {
    const { result } = hook();
    await act(async () => {
      expect(await result.current.setTicked([reviewTrack(1, "matched")], true)).toBe(0);
    });
    expect(set).not.toHaveBeenCalled();
  });

  it("puts the rows back when the engine refuses, and says null", async () => {
    set.mockRejectedValue(new Error("The library is busy"));
    const { result } = hook();
    let changed: number | null = 0;
    await act(async () => {
      changed = await result.current.setTicked([reviewTrack(1, "matched")], false);
    });
    expect(changed).toBeNull();
    expect(patch).toHaveBeenNthCalledWith(1, 1, { ticked: false });
    expect(patch).toHaveBeenNthCalledWith(2, 1, { ticked: true });
  });

  it("is busy while a tick is being sent", async () => {
    let finish: (value: unknown) => void = () => undefined;
    set.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const { result } = hook();
    act(() => {
      void result.current.setTicked([reviewTrack(1, "matched")], false);
    });
    await waitFor(() => expect(result.current.busy).toBe(true));
    await act(async () => finish({ ticked: false, changed: 1, skipped: 0, batch_id: "b" }));
    expect(result.current.busy).toBe(false);
  });
});

describe("setAll", () => {
  it("names the whole review by its run or playlist and reads the table again", async () => {
    const { result } = hook({ jobId: "job-1" });
    await act(async () => {
      expect(await result.current.setAll(true)).toEqual({ changed: 2, batchId: "b" });
    });
    expect(set).toHaveBeenCalledWith({ ticked: true, scope: { job_id: "job-1" } });
    expect(reread).toHaveBeenCalledTimes(1);
  });

  it("names no scope for the whole library", async () => {
    const { result } = hook({});
    await act(async () => {
      await result.current.setAll(false);
    });
    expect(set).toHaveBeenCalledWith({ ticked: false, scope: {} });
  });

  it("reads the table again even when it was refused, so it says what is so", async () => {
    set.mockRejectedValue(new Error("no"));
    const { result } = hook();
    await act(async () => {
      expect(await result.current.setAll(true)).toBeNull();
    });
    expect(reread).toHaveBeenCalled();
  });
});

describe("a long header tick", () => {
  it("is followed to its end and answers from the job's result, then the table is read again", async () => {
    set.mockResolvedValue({ ticked: false, batch_id: "jb", job_id: "tj", id: "tj" });
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.getJob = vi
      .fn()
      .mockResolvedValue({ id: "tj", state: "succeeded" });
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.getJobResults = vi
      .fn()
      .mockResolvedValue({ result: { changed: 40, batch_id: "jb" } });
    const { result } = hook();
    await act(async () => {
      expect(await result.current.setAll(false)).toEqual({ changed: 40, batchId: "jb" });
    });
    expect(reread).toHaveBeenCalledTimes(1);
  });

  it("says so when the job fails, and answers null", async () => {
    set.mockResolvedValue({ ticked: false, batch_id: "jb", job_id: "tj", id: "tj" });
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.getJob = vi
      .fn()
      .mockResolvedValue({ id: "tj", state: "failed", error: { message: "Out of disk space" } });
    const { result } = hook();
    await act(async () => {
      expect(await result.current.setAll(false)).toBeNull();
    });
  });
});

describe("undo", () => {
  it("reverts the batch the header tick named, and reads the table again", async () => {
    const revert = vi.fn().mockResolvedValue({ reverted: {} });
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.revertBatch = revert;
    const { result } = hook();
    await act(async () => {
      expect(await result.current.undo("b1")).toBe(true);
    });
    expect(revert).toHaveBeenCalledWith({ batch_id: "b1" });
    expect(reread).toHaveBeenCalled();
  });

  it("says no when the engine refuses it", async () => {
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.revertBatch = vi
      .fn()
      .mockRejectedValue(new Error("Nothing to undo"));
    const { result } = hook();
    await act(async () => {
      expect(await result.current.undo("b1")).toBe(false);
    });
  });
});

describe("without the desktop app", () => {
  it("changes nothing and says so", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    const { result } = hook();
    await act(async () => {
      expect(await result.current.setTicked([reviewTrack(1, "matched")], false)).toBeNull();
      expect(await result.current.setAll(false)).toBeNull();
    });
    expect(patch).not.toHaveBeenCalled();
  });
});
