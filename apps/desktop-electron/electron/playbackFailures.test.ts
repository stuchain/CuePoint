import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAILURE_COALESCE_MS,
  FailureReporter,
  failureMessage,
  type FailureReport,
} from "./playbackFailures";

/**
 * Coalescing failures into one message (PLAYER-10, DEC-054).
 *
 * The requirement this file exists for is the one that is easy to state and
 * easy to get wrong: a disconnected drive fails every track in the queue, and
 * the user must be told **once**. A per-failure toast is not a worse version of
 * this behaviour, it is a broken app — five thousand toasts is a window nobody
 * can use.
 *
 * Timers are faked, so the window is exercised rather than waited on.
 */

function reporter(windowMs?: number) {
  const reports: FailureReport[] = [];
  const instance = new FailureReporter({
    windowMs,
    onReport: (report) => reports.push(report),
  });
  return { instance, reports };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("what the user is told", () => {
  it("names the track when exactly one failed", () => {
    expect(failureMessage(1, "Strobe", "loading failed", false)).toBe(
      "Could not play “Strobe” (loading failed)",
    );
  });

  it("names no track when many failed", () => {
    // Twelve names is not a toast, it is a wall.
    expect(failureMessage(12, null, null, false)).toBe("12 tracks could not be played");
  });

  it("groups thousands legibly", () => {
    expect(failureMessage(5000, null, null, false)).toBe("5,000 tracks could not be played");
  });

  it("says that playback stopped, when it did", () => {
    expect(failureMessage(12, null, null, true)).toBe(
      "12 tracks could not be played — playback stopped",
    );
    expect(failureMessage(1, "Strobe", null, true)).toBe(
      "Could not play “Strobe” — playback stopped",
    );
  });

  it("copes with a track that has no title", () => {
    expect(failureMessage(1, "   ", "loading failed", false)).toBe(
      "Could not play that track (loading failed)",
    );
    expect(failureMessage(1, null, null, false)).toBe("Could not play that track");
  });

  it("leaves out an empty reason rather than showing empty brackets", () => {
    expect(failureMessage(1, "Strobe", "  ", false)).toBe("Could not play “Strobe”");
  });
});

describe("coalescing", () => {
  it("says nothing until the run has ended", () => {
    const { instance, reports } = reporter();

    instance.record({ title: "a", reason: "loading failed" });

    expect(reports).toHaveLength(0);
    vi.advanceTimersByTime(FAILURE_COALESCE_MS - 1);
    expect(reports).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(reports).toHaveLength(1);
  });

  it("reports a run of failures exactly once, counted", () => {
    // The whole point of the step: a dead drive is one message, not one each.
    const { instance, reports } = reporter();

    for (let index = 0; index < 5_000; index += 1) {
      instance.record({ title: `track ${index}`, reason: "loading failed" });
      // Failures on a dead drive arrive far faster than the window.
      vi.advanceTimersByTime(2);
    }
    vi.advanceTimersByTime(FAILURE_COALESCE_MS);

    expect(reports).toHaveLength(1);
    expect(reports[0]!.count).toBe(5_000);
    expect(reports[0]!.message).toBe("5,000 tracks could not be played");
  });

  it("keeps the window open while failures keep arriving", () => {
    const { instance, reports } = reporter();

    instance.record({ title: "a", reason: null });
    vi.advanceTimersByTime(FAILURE_COALESCE_MS - 10);
    instance.record({ title: "b", reason: null });
    vi.advanceTimersByTime(FAILURE_COALESCE_MS - 10);

    // Neither has been reported: the second reset the window.
    expect(reports).toHaveLength(0);
    vi.advanceTimersByTime(FAILURE_COALESCE_MS);
    expect(reports).toEqual([expect.objectContaining({ count: 2 })]);
  });

  it("starts a new run after one has been reported", () => {
    const { instance, reports } = reporter();

    instance.record({ title: "a", reason: null });
    vi.advanceTimersByTime(FAILURE_COALESCE_MS);
    instance.record({ title: "b", reason: null });
    vi.advanceTimersByTime(FAILURE_COALESCE_MS);

    expect(reports.map((report) => report.title)).toEqual(["a", "b"]);
  });

  it("names the track of a run of one and nothing of a run of two", () => {
    const { instance, reports } = reporter();

    instance.record({ title: "Strobe", reason: "loading failed" });
    vi.advanceTimersByTime(FAILURE_COALESCE_MS);
    instance.record({ title: "Strobe", reason: "loading failed" });
    instance.record({ title: "Cirez D", reason: "loading failed" });
    vi.advanceTimersByTime(FAILURE_COALESCE_MS);

    expect(reports[0]).toMatchObject({ count: 1, title: "Strobe", reason: "loading failed" });
    expect(reports[1]).toMatchObject({ count: 2, title: null, reason: null });
  });

  it("reports immediately when playback stopped", () => {
    // The message has to arrive with the silence it explains, not 400ms later.
    const { instance, reports } = reporter();

    instance.record({ title: "a", reason: null });
    instance.record({ title: "b", reason: null });
    instance.stopped();

    expect(reports).toEqual([
      expect.objectContaining({ count: 2, stopped: true }),
    ]);
    // And the pending run is gone, so the window does not report it again.
    vi.advanceTimersByTime(FAILURE_COALESCE_MS * 2);
    expect(reports).toHaveLength(1);
  });

  it("says nothing when playback stops with nothing having failed", () => {
    // A queue that simply ended is not a failure and gets no toast.
    const { instance, reports } = reporter();

    instance.stopped();

    expect(reports).toHaveLength(0);
  });

  it("counts what is waiting, so the caller can tell a whole queue has failed", () => {
    const { instance } = reporter();

    expect(instance.pending).toBe(0);
    instance.record({ title: "a", reason: null });
    instance.record({ title: "b", reason: null });
    expect(instance.pending).toBe(2);
    vi.advanceTimersByTime(FAILURE_COALESCE_MS);
    expect(instance.pending).toBe(0);
  });

  it("stops reporting once disposed", () => {
    // A controller that has been torn down must not toast into a dead window.
    const { instance, reports } = reporter();
    instance.record({ title: "a", reason: null });

    instance.dispose();
    vi.advanceTimersByTime(FAILURE_COALESCE_MS * 2);
    instance.record({ title: "b", reason: null });
    vi.advanceTimersByTime(FAILURE_COALESCE_MS * 2);

    expect(reports).toHaveLength(0);
  });

  it("does not hold the process open", () => {
    // An armed timer with no `unref` keeps Electron's main process alive at
    // quit for as long as a pending toast lasts.
    const { instance } = reporter();
    const unrefs: number[] = [];
    const original = globalThis.setTimeout;
    const spy = (handler: unknown, timeout?: number) => {
      const timer = (original as unknown as (h: unknown, t?: number) => unknown)(
        handler,
        timeout,
      ) as { unref?: () => unknown };
      const realUnref = timer.unref?.bind(timer);
      timer.unref = () => {
        unrefs.push(1);
        return realUnref?.() ?? timer;
      };
      return timer;
    };
    vi.spyOn(globalThis, "setTimeout").mockImplementation(spy as unknown as typeof setTimeout);

    instance.record({ title: "a", reason: null });

    expect(unrefs).toHaveLength(1);
  });
});
