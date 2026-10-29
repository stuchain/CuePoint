import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRendererWatchdog } from "./rendererWatchdog";

/**
 * A page that is there but does not answer (HARDEN-05): three misses in a row end its process, one
 * answer resets the count, a page that cannot be asked is not a miss, and a kill that is never
 * reported is handed to the recovery.
 */

function rig(options: { answers?: () => boolean; canProbe?: () => boolean } = {}) {
  const calls: string[] = [];
  const watchdog = createRendererWatchdog({
    probe: () => ((options.answers?.() ?? false) ? Promise.resolve(true) : new Promise(() => undefined)),
    canProbe: () => options.canProbe?.() ?? true,
    kill: () => calls.push("kill"),
    stopped: (details) => calls.push(`stopped:${details.reason}`),
    intervalMs: 100,
    timeoutMs: 50,
    maxMisses: 3,
    graceMs: 1_000,
  });
  return { watchdog, calls };
}

describe("a page that stops answering", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("has its process ended after three misses in a row", async () => {
    const { watchdog, calls } = rig();
    watchdog.start();
    await vi.advanceTimersByTimeAsync(100 + 50 + 100 + 50);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(100 + 50);
    expect(calls).toEqual(["kill"]);
    watchdog.stop();
  });

  it("is handed to the recovery when the kill is never reported", async () => {
    const { watchdog, calls } = rig();
    watchdog.start();
    await vi.advanceTimersByTimeAsync(450);
    expect(calls).toEqual(["kill"]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toEqual(["kill", "stopped:unresponsive"]);
    watchdog.stop();
  });

  it("leaves the stop to render-process-gone when that comes", async () => {
    const { watchdog, calls } = rig();
    watchdog.start();
    await vi.advanceTimersByTimeAsync(450);
    watchdog.noteGone();
    // The grace the kill was given has run out by now; the next one (a new page, asked again) has not.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls.filter((call) => call.startsWith("stopped"))).toEqual([]);
    watchdog.stop();
  });

  it("is not a miss while the page is loading, crashed or being debugged", async () => {
    let canProbe = false;
    const { watchdog, calls } = rig({ canProbe: () => canProbe });
    watchdog.start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toEqual([]);
    canProbe = true;
    await vi.advanceTimersByTimeAsync(450);
    expect(calls).toEqual(["kill"]);
    watchdog.stop();
  });

  it("does not end a page that answers", async () => {
    const { watchdog, calls } = rig({ answers: () => true });
    watchdog.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toEqual([]);
    watchdog.stop();
  });

  it("keeps watching the page that replaces it", async () => {
    const { watchdog, calls } = rig();
    watchdog.start();
    await vi.advanceTimersByTimeAsync(450);
    watchdog.noteGone();
    await vi.advanceTimersByTimeAsync(450);
    expect(calls.filter((call) => call === "kill")).toHaveLength(2);
    watchdog.stop();
  });

  it("does nothing once stopped", async () => {
    const { watchdog, calls } = rig();
    watchdog.start();
    watchdog.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toEqual([]);
  });
});
