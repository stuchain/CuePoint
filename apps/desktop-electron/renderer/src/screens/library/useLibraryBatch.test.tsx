/**
 * Running one batch edit (ORG-11, DEC-063).
 *
 * Two things are worth more than the rest. **Above the threshold it asks
 * first**, at the same number the engine forks a job at — a confirmation for
 * work that finished on the request thread is a warning about nothing, and a
 * 47,913-track edit started without one is the opposite mistake. And **the
 * page re-reads whatever happened**, including after a batch that failed
 * partway, because a batch that stopped halfway still changed everything it
 * reached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { BATCH_JOB_THRESHOLD, type BatchAction } from "./libraryBatch";
import { useLibraryBatch, type BatchRun } from "./useLibraryBatch";

const TAG: BatchAction = { kind: "add_tag", value: 1, target: "Peak-time" };

function run(over: Partial<BatchRun> = {}): BatchRun {
  return {
    action: TAG,
    selection: { track_ids: [7, 8] },
    count: 2,
    ...over,
  };
}

let applyBatch: ReturnType<typeof vi.fn>;
let getJob: ReturnType<typeof vi.fn>;
let getJobResults: ReturnType<typeof vi.fn>;
let onMessage: ReturnType<typeof vi.fn<(message: string, tone: string) => void>>;
let onApplied: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  onMessage = vi.fn<(message: string, tone: string) => void>();
  onApplied = vi.fn<() => void>();
  applyBatch = vi.fn(async () => ({
    applied: {
      batch_id: "b1",
      operation: "add_tag",
      target: "Peak-time",
      total: 2,
      changed: 2,
      unchanged: 0,
      failed: 0,
      cancelled: false,
    },
  }));
  getJob = vi.fn(async () => ({ id: "job-1", state: "succeeded" }));
  getJobResults = vi.fn(async () => ({
    id: "job-1",
    state: "succeeded",
    results: [],
    result: {
      batch_id: "b2",
      operation: "add_tag",
      target: "Peak-time",
      total: 40,
      changed: 38,
      unchanged: 2,
      failed: 0,
      cancelled: false,
    },
  }));
  (window as unknown as { cuepoint?: unknown }).cuepoint = {
    applyBatch,
    getJob,
    getJobResults,
  };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

function hook() {
  return renderHook(() => useLibraryBatch({ onMessage, onApplied }));
}

describe("a batch small enough to apply now", () => {
  it("asks nothing and applies", async () => {
    const { result } = hook();

    await act(async () => {
      await result.current.start(run());
    });

    expect(result.current.pending).toBeNull();
    expect(applyBatch).toHaveBeenCalledWith({
      selection: { track_ids: [7, 8] },
      operation: { kind: "add_tag", value: 1 },
    });
  });

  it("says what it did", async () => {
    const { result } = hook();

    await act(async () => {
      await result.current.start(run());
    });

    expect(onMessage).toHaveBeenCalledWith(
      expect.stringContaining("Tagged 2 tracks “Peak-time”."),
      "success",
    );
  });

  it("tells the page to re-read", async () => {
    const { result } = hook();
    await act(async () => {
      await result.current.start(run());
    });
    expect(onApplied).toHaveBeenCalled();
  });
});

describe("a batch large enough to be a job", () => {
  const big = run({ count: BATCH_JOB_THRESHOLD + 1, selection: { query: {} } });

  it("asks before it does anything", async () => {
    const { result } = hook();

    await act(async () => {
      await result.current.start(big);
    });

    expect(applyBatch).not.toHaveBeenCalled();
    expect(result.current.question).toBe("Tag 1,001 tracks “Peak-time”?");
  });

  it("applies once it is confirmed", async () => {
    const { result } = hook();
    await act(async () => {
      await result.current.start(big);
    });

    await act(async () => {
      await result.current.confirm();
    });

    expect(applyBatch).toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it("does nothing when it is cancelled", async () => {
    const { result } = hook();
    await act(async () => {
      await result.current.start(big);
    });

    act(() => result.current.cancel());

    expect(applyBatch).not.toHaveBeenCalled();
    expect(result.current.pending).toBeNull();
  });

  it("asks at exactly the threshold and not below it", async () => {
    const { result } = hook();

    await act(async () => {
      await result.current.start(run({ count: BATCH_JOB_THRESHOLD }));
    });

    expect(result.current.pending).toBeNull();
    expect(applyBatch).toHaveBeenCalled();
  });
});

describe("a batch that became a job", () => {
  beforeEach(() => {
    applyBatch.mockResolvedValue({ job_id: "job-1", id: "job-1", state: "queued" });
  });

  it("follows it and reports the counts it finished with", async () => {
    const { result } = hook();

    await act(async () => {
      await result.current.start(run());
    });

    await waitFor(() =>
      expect(onMessage).toHaveBeenCalledWith(
        expect.stringContaining("Tagged 38 tracks “Peak-time” — 2 already had it."),
        "success",
      ),
    );
    expect(onApplied).toHaveBeenCalled();
  });

  it("says so when the job failed, and re-reads anyway", async () => {
    // Whatever it reached before it failed is changed, so what is on screen is
    // already out of date.
    getJob.mockResolvedValue({
      id: "job-1",
      state: "failed",
      error: { message: "No tag with id 1" },
    });
    const { result } = hook();

    await act(async () => {
      await result.current.start(run());
    });

    await waitFor(() =>
      expect(onMessage).toHaveBeenCalledWith(
        expect.stringContaining("No tag with id 1"),
        "warning",
      ),
    );
    expect(onApplied).toHaveBeenCalled();
  });

  it("still says it is done when the receipt cannot be read", async () => {
    getJobResults.mockRejectedValue(new Error("gone"));
    const { result } = hook();

    await act(async () => {
      await result.current.start(run());
    });

    await waitFor(() => expect(onMessage).toHaveBeenCalledWith("Done.", "success"));
    expect(onApplied).toHaveBeenCalled();
  });
});

describe("when it cannot run at all", () => {
  it("says so rather than looking as though it applied", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    const { result } = hook();

    await act(async () => {
      await result.current.start(run());
    });

    expect(onMessage).toHaveBeenCalledWith(
      expect.stringContaining("needs the desktop app"),
      "warning",
    );
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("reports a refusal in the engine's own words", async () => {
    applyBatch.mockRejectedValue(new Error("Rating must be between 0 and 5 stars, got 9"));
    const { result } = hook();

    await act(async () => {
      await result.current.start(run());
    });

    expect(onMessage).toHaveBeenCalledWith(
      "Rating must be between 0 and 5 stars, got 9",
      "warning",
    );
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("says so when the engine answers with neither counts nor a job", async () => {
    applyBatch.mockResolvedValue({});
    const { result } = hook();

    await act(async () => {
      await result.current.start(run());
    });

    expect(onMessage).toHaveBeenCalledWith(
      expect.stringContaining("without counts and without a job"),
      "warning",
    );
  });
});
