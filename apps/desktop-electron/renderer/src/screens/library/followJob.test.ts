/**
 * Waiting for a library job to finish (LIBRARY-11).
 *
 * Small, and worth its own tests: every button on the Library page routes
 * through this, and each of its failure modes looks like the page hanging. A
 * promise that never settles is indistinguishable from a slow import.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { followJob, isTerminal } from "./followJob";

interface Bridge {
  getJob?: ReturnType<typeof vi.fn>;
  subscribeJobEvents?: ReturnType<typeof vi.fn>;
}

function install(bridge: Bridge | undefined) {
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
}

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("isTerminal", () => {
  it("knows the three states a job stops in", () => {
    expect(isTerminal("succeeded")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
  });

  it("does not stop on a running one", () => {
    expect(isTerminal("running")).toBe(false);
    expect(isTerminal("queued")).toBe(false);
    expect(isTerminal(undefined)).toBe(false);
  });
});

describe("followJob", () => {
  it("resolves from the immediate check, without waiting for a tick", async () => {
    // Not hypothetical: an apply against an unchanged export finishes in
    // milliseconds, and would be over before any subscription attached.
    install({ getJob: vi.fn().mockResolvedValue({ state: "succeeded" }) });

    const outcome = await followJob("job-1").finished;

    expect(outcome.state).toBe("succeeded");
  });

  it("carries the job's error through", async () => {
    install({
      getJob: vi.fn().mockResolvedValue({
        state: "failed",
        error: { code: "LIBRARY_NOT_IMPORTED", message: "nothing imported" },
      }),
    });

    const outcome = await followJob("job-1").finished;

    expect(outcome.state).toBe("failed");
    expect(outcome.error?.code).toBe("LIBRARY_NOT_IMPORTED");
  });

  it("keeps polling until the job stops", async () => {
    vi.useFakeTimers();
    const getJob = vi
      .fn()
      .mockResolvedValueOnce({ state: "queued" })
      .mockResolvedValueOnce({ state: "running" })
      .mockResolvedValue({ state: "succeeded" });
    install({ getJob });

    const handle = followJob("job-1", 10);
    // Three ticks: the immediate check, then two intervals.
    for (let i = 0; i < 3; i += 1) {
      await vi.advanceTimersByTimeAsync(10);
    }

    await expect(handle.finished).resolves.toEqual({ state: "succeeded", error: undefined });
    expect(getJob.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("stops polling once it has an answer", async () => {
    vi.useFakeTimers();
    const getJob = vi.fn().mockResolvedValue({ state: "succeeded" });
    install({ getJob });

    await followJob("job-1", 10).finished;
    const callsAtFinish = getJob.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100);

    expect(getJob.mock.calls.length).toBe(callsAtFinish);
  });

  it("prefers the subscription over polling when there is one", async () => {
    vi.useFakeTimers();
    let emit: ((event: unknown) => void) | null = null;
    const getJob = vi.fn().mockResolvedValue({ state: "running" });
    const unsubscribe = vi.fn();
    install({
      getJob,
      subscribeJobEvents: vi.fn((_id: string, onEvent: (event: unknown) => void) => {
        emit = onEvent;
        return unsubscribe;
      }),
    });

    const handle = followJob("job-1", 10);
    await vi.advanceTimersByTimeAsync(50);
    // No interval was started, so the only call is the immediate check.
    expect(getJob).toHaveBeenCalledTimes(1);

    emit!({ state: "succeeded" });

    await expect(handle.finished).resolves.toEqual({ state: "succeeded", error: undefined });
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("fails rather than hanging when there is no bridge", async () => {
    install(undefined);

    const outcome = await followJob("job-1").finished;

    expect(outcome.state).toBe("failed");
    expect(outcome.error?.code).toBe("NO_BRIDGE");
  });

  it("fails rather than hanging when the status cannot be read", async () => {
    install({ getJob: vi.fn().mockRejectedValue(new Error("engine went away")) });

    const outcome = await followJob("job-1").finished;

    expect(outcome.state).toBe("failed");
    expect(outcome.error?.message).toBe("engine went away");
  });

  it("stops listening when told to, and leaves the promise alone", async () => {
    // The caller stops because it has gone away; resolving would run a
    // completion handler for a screen that is no longer on the page.
    vi.useFakeTimers();
    const getJob = vi.fn().mockResolvedValue({ state: "running" });
    install({ getJob });

    const handle = followJob("job-1", 10);
    await vi.advanceTimersByTimeAsync(10);
    handle.stop();
    const callsAtStop = getJob.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100);

    expect(getJob.mock.calls.length).toBe(callsAtStop);
    const settled = await Promise.race([
      handle.finished.then(() => "settled"),
      Promise.resolve("still waiting"),
    ]);
    expect(settled).toBe("still waiting");
  });
});
