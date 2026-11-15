/** Ticking tracks of a review: shown at once, sent after, and put back in words when refused. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { ToastProvider } from "../../../components";
import { fakeFacade } from "../../../reporting/fakeFacade.testFixture";
import { resetRendererReporting, setupRendererReporting } from "../../../reporting/reporting";
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
  resetRendererReporting();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

/** An engine answer as the bridge rejects it: the engine's words, with its status and code. */
function engineError(status: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { status, code, reportId: null });
}

/** A tick the engine has not answered yet, and a way to answer it. */
function held() {
  let answer: (value: unknown) => void = () => undefined;
  let refuse: (cause: unknown) => void = () => undefined;
  set.mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        answer = resolve;
        refuse = reject;
      }),
  );
  return { answer: (value: unknown) => answer(value), refuse: (cause: unknown) => refuse(cause) };
}

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

describe("a busy library (Sentry PYTHON-1N)", () => {
  const BUSY = "The library is busy. Try again in a moment.";

  it("puts the tick back, says so in the engine's words, and reports nothing", async () => {
    const sdk = fakeFacade();
    await setupRendererReporting({
      sdk,
      bridge: { errorReporting: { get: async () => ({ enabled: true, configured: true }), set: async (enabled) => ({ enabled }) } },
    });
    set.mockRejectedValue(engineError(503, "LIBRARY_BUSY", BUSY));
    const { result } = hook();
    let changed: number | null = 0;
    await act(async () => {
      changed = await result.current.setTicked([reviewTrack(1, "matched")], false);
    });

    expect(changed).toBeNull();
    expect(patch).toHaveBeenNthCalledWith(1, 1, { ticked: false });
    expect(patch).toHaveBeenNthCalledWith(2, 1, { ticked: true });
    expect(await screen.findByText(BUSY)).toBeTruthy();
    expect(sdk.exceptions).toEqual([]);
    expect(result.current.busy).toBe(false);
  });

  it("ignores another click on a row whose tick is still being saved", async () => {
    const first = held();
    const { result } = hook();
    const row = reviewTrack(1, "matched");
    let firstAnswer: Promise<number | null> = Promise.resolve(null);
    act(() => {
      firstAnswer = result.current.setTicked([row], false);
    });
    await waitFor(() => expect(result.current.busy).toBe(true));

    // The table now shows the row unticked; clicking it again would tick it.
    let second: number | null = 0;
    await act(async () => {
      second = await result.current.setTicked([{ ...row, ticked: false }], true);
    });
    expect(second).toBeNull();
    expect(set).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledTimes(1);

    await act(async () => first.answer({ ticked: false, changed: 1, skipped: 0, batch_id: "b" }));
    expect(await firstAnswer).toBe(1);
    // The row ends as the click that was saved, never as the one that lost a race.
    expect(patch.mock.calls).toEqual([[1, { ticked: false }]]);
    expect(result.current.busy).toBe(false);
  });

  it("still sends the other rows of a selection while one row waits", async () => {
    const first = held();
    const { result } = hook();
    act(() => {
      void result.current.setTicked([reviewTrack(1, "matched")], false);
    });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      await result.current.setTicked([reviewTrack(1, "matched"), reviewTrack(2, "matched")], false);
    });
    expect(set).toHaveBeenLastCalledWith({ ticked: false, track_ids: [2] });
    await act(async () => first.answer({ ticked: false, changed: 1, skipped: 0, batch_id: "b" }));
  });

  it("ignores a row click while the whole review is being ticked, then takes clicks again", async () => {
    const all = held();
    const { result } = hook();
    let whole: Promise<unknown> = Promise.resolve(null);
    act(() => {
      whole = result.current.setAll(false);
    });
    await waitFor(() => expect(result.current.busy).toBe(true));

    await act(async () => {
      expect(await result.current.setTicked([reviewTrack(1, "matched")], false)).toBeNull();
    });
    expect(set).toHaveBeenCalledTimes(1);
    expect(patch).not.toHaveBeenCalled();

    await act(async () => all.answer({ ticked: false, changed: 4, skipped: 0, batch_id: "b" }));
    await whole;
    await act(async () => {
      expect(await result.current.setTicked([reviewTrack(1, "matched")], false)).toBe(2);
    });
    expect(set).toHaveBeenCalledTimes(2);
  });

  it("takes row clicks again after a whole-review tick the engine refused", async () => {
    const all = held();
    const { result } = hook();
    let whole: Promise<unknown> = Promise.resolve(null);
    act(() => {
      whole = result.current.setAll(false);
    });
    await waitFor(() => expect(result.current.busy).toBe(true));
    await act(async () => all.refuse(engineError(503, "LIBRARY_BUSY", BUSY)));
    expect(await whole).toBeNull();
    await act(async () => {
      expect(await result.current.setTicked([reviewTrack(1, "matched")], false)).toBe(2);
    });
  });

  it("takes a click again once the save has been answered, refused or not", async () => {
    const first = held();
    const { result } = hook();
    act(() => {
      void result.current.setTicked([reviewTrack(1, "matched")], false);
    });
    await waitFor(() => expect(result.current.busy).toBe(true));
    await act(async () => first.refuse(engineError(503, "LIBRARY_BUSY", BUSY)));
    await waitFor(() => expect(result.current.busy).toBe(false));

    await act(async () => {
      expect(await result.current.setTicked([reviewTrack(1, "matched")], false)).toBe(2);
    });
    expect(set).toHaveBeenCalledTimes(2);
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
