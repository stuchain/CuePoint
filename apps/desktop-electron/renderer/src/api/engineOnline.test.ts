/**
 * One online/offline state for the whole window (banner step).
 *
 * The strip, the banner and the page dimming all read this store, so these
 * tests pin what "offline" means and that a false alarm cannot flip it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderHook } from "@testing-library/react";
import {
  getSnapshot,
  useEngineOffline,
  noteOutage,
  resetEngineOnlineForTests,
  subscribe,
} from "./engineOnline";
import { userMessage } from "./userMessage";

let getEngineStatus: ReturnType<typeof vi.fn>;
let stops: Array<() => void>;

function listen(): void {
  stops.push(subscribe(() => {}));
}

function bridge(): void {
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getEngineStatus };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
  stops = [];
  getEngineStatus = vi.fn().mockResolvedValue({ connected: true });
  bridge();
});

afterEach(() => {
  for (const stop of stops) stop();
  resetEngineOnlineForTests();
  vi.useRealTimers();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("polling", () => {
  it("polls when the first subscriber arrives and every 4 s after", async () => {
    listen();
    await vi.advanceTimersByTimeAsync(0);
    expect(getEngineStatus).toHaveBeenCalledTimes(1);
    expect(getSnapshot().status).toEqual({ connected: true });

    await vi.advanceTimersByTimeAsync(4000);
    expect(getEngineStatus).toHaveBeenCalledTimes(2);
  });

  it("shares one poll between subscribers and stops when the last leaves", async () => {
    listen();
    listen();
    await vi.advanceTimersByTimeAsync(0);
    expect(getEngineStatus).toHaveBeenCalledTimes(1);

    stops.pop()!();
    await vi.advanceTimersByTimeAsync(4000);
    expect(getEngineStatus).toHaveBeenCalledTimes(2);

    stops.pop()!();
    await vi.advanceTimersByTimeAsync(12000);
    expect(getEngineStatus).toHaveBeenCalledTimes(2);
  });

  it("treats a failed read as an unreachable background process", async () => {
    getEngineStatus.mockRejectedValue(new Error("ipc gone"));
    listen();
    await vi.advanceTimersByTimeAsync(0);

    expect(getSnapshot().status).toEqual({
      connected: false,
      error: "Background process unreachable",
    });
    expect(getSnapshot().offline).toBe(true);
  });

  it("has no status and is never offline without a bridge", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    listen();
    noteOutage();
    await vi.advanceTimersByTimeAsync(0);

    expect(getSnapshot()).toMatchObject({ status: null, offline: false, lastOkAt: null });
  });
});

describe("offline", () => {
  it("is false while connected and remembers when it was last connected", async () => {
    listen();
    await vi.advanceTimersByTimeAsync(0);

    expect(getSnapshot().offline).toBe(false);
    expect(getSnapshot().lastOkAt).toBe(Date.now());
  });

  it("is false for the first launch's starting, true for every later starting", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, starting: true });
    listen();
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot().offline).toBe(false);

    // A restart's starting after it was up (status says reconnecting while it is automatic).
    getEngineStatus.mockResolvedValue({ connected: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(getSnapshot().offline).toBe(false);
    getEngineStatus.mockResolvedValue({ connected: false, starting: true, reconnecting: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(getSnapshot().offline).toBe(true);
    // The person's own restart: starting, not reconnecting, but it had been up.
    getEngineStatus.mockResolvedValue({ connected: false, starting: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(getSnapshot().offline).toBe(true);
  });

  it("counts a starting after the first launch gave up as offline", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });
    listen();
    await vi.advanceTimersByTimeAsync(0);
    getEngineStatus.mockResolvedValue({ connected: false, starting: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(getSnapshot().offline).toBe(true);
  });

  it("is false while starting for the first time, true while reconnecting and once given up", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, starting: true });
    listen();
    await vi.advanceTimersByTimeAsync(0);
    expect(getSnapshot().offline).toBe(false);

    getEngineStatus.mockResolvedValue({ connected: false, reconnecting: true, restartAttempts: 1 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(getSnapshot().offline).toBe(true);

    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });
    await vi.advanceTimersByTimeAsync(4000);
    expect(getSnapshot().offline).toBe(true);
    expect(getSnapshot().lastOkAt).toBeNull();
  });

  it("keeps lastOkAt from the last connected poll", async () => {
    listen();
    await vi.advanceTimersByTimeAsync(0);
    const ok = getSnapshot().lastOkAt;

    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });
    await vi.advanceTimersByTimeAsync(4000);

    expect(getSnapshot().lastOkAt).toBe(ok);
  });
});

describe("a push from main", () => {
  it("re-reads at once on each change, and stops listening with the last subscriber", async () => {
    let push: () => void = () => {};
    const unsubscribe = vi.fn();
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.onEngineStatusChanged = vi.fn(
      (listener: () => void) => {
        push = listener;
        return unsubscribe;
      },
    );
    listen();
    await vi.advanceTimersByTimeAsync(0);
    getEngineStatus.mockClear();
    getEngineStatus.mockResolvedValue({ connected: false, reconnecting: true, restartAttempts: 1 });

    push();
    await vi.advanceTimersByTimeAsync(0);

    expect(getEngineStatus).toHaveBeenCalledTimes(1);
    expect(getSnapshot().offline).toBe(true);

    stops.pop()!();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("is not answered by a read that began before it", async () => {
    let push: () => void = () => {};
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.onEngineStatusChanged = (
      listener: () => void,
    ) => {
      push = listener;
      return () => {};
    };
    let finish: (status: unknown) => void = () => {};
    getEngineStatus.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    listen();

    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });
    push();
    finish({ connected: true });
    await vi.advanceTimersByTimeAsync(0);

    expect(getSnapshot().offline).toBe(true);
  });
});

describe("rendering", () => {
  it("keeps the same snapshot while polls find nothing new", async () => {
    listen();
    await vi.advanceTimersByTimeAsync(0);
    const first = getSnapshot();

    await vi.advanceTimersByTimeAsync(12000);

    expect(getEngineStatus.mock.calls.length).toBeGreaterThan(2);
    expect(getSnapshot()).toBe(first);
  });

  it("tells a boolean reader only when offline flips", async () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useEngineOffline();
    });
    await vi.advanceTimersByTimeAsync(0);
    const settled = renders;

    getEngineStatus.mockResolvedValue({ connected: true, version: "2" });
    await vi.advanceTimersByTimeAsync(8000);
    expect(renders).toBe(settled);

    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });
    await vi.advanceTimersByTimeAsync(4000);
    expect(renders).toBe(settled + 1);
  });

  it("takes lastOkAt at the moment it goes offline", async () => {
    listen();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(8000);
    const lastOk = Date.now();
    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });
    await vi.advanceTimersByTimeAsync(4000);

    expect(getSnapshot().lastOkAt).toBe(lastOk);
  });
});

describe("reset", () => {
  it("ignores a read that was in flight when the store was reset", async () => {
    let finish: (status: unknown) => void = () => {};
    getEngineStatus.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    listen();
    resetEngineOnlineForTests();
    finish({ connected: false, error: "Engine not running" });
    await vi.advanceTimersByTimeAsync(0);

    expect(getSnapshot()).toMatchObject({ status: null, offline: false });
  });
});

describe("noteOutage", () => {
  it("goes offline at once and re-polls straight away", async () => {
    listen();
    await vi.advanceTimersByTimeAsync(0);
    getEngineStatus.mockClear();
    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });

    noteOutage();
    expect(getSnapshot().offline).toBe(true);
    expect(getEngineStatus).toHaveBeenCalledTimes(1);
  });

  it("is cleared by a connected re-poll", async () => {
    listen();
    await vi.advanceTimersByTimeAsync(0);

    noteOutage();
    expect(getSnapshot().offline).toBe(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(getSnapshot().offline).toBe(false);
  });

  it("starts one poll however often it is called in a row", async () => {
    listen();
    await vi.advanceTimersByTimeAsync(0);
    getEngineStatus.mockClear();

    for (let i = 0; i < 20; i++) noteOutage();
    await vi.advanceTimersByTimeAsync(0);

    expect(getEngineStatus).toHaveBeenCalledTimes(1);
  });

  it("is not cleared by a poll that began before it", async () => {
    let finish: (status: unknown) => void = () => {};
    getEngineStatus.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    resetEngineOnlineForTests();
    listen();

    noteOutage();
    finish({ connected: true });
    await vi.advanceTimersByTimeAsync(0);
    // The stale answer was discarded and a fresh read made.
    expect(getEngineStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(getSnapshot().offline).toBe(false);
  });
});

describe("userMessage", () => {
  it("notes an outage for the errors isOutage accepts", async () => {
    listen();
    await vi.advanceTimersByTimeAsync(0);
    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });

    userMessage(new Error("fetch failed"));

    expect(getSnapshot().offline).toBe(true);
  });

  it("does not for a player outage", async () => {
    listen();
    await vi.advanceTimersByTimeAsync(0);
    getEngineStatus.mockClear();

    userMessage(Object.assign(new Error("The audio player is not running."), { code: "PLAYER_UNAVAILABLE" }));

    expect(getSnapshot().offline).toBe(false);
    expect(getEngineStatus).not.toHaveBeenCalled();
  });

  it("does not for a 500 or any other failure", async () => {
    listen();
    await vi.advanceTimersByTimeAsync(0);
    getEngineStatus.mockClear();

    const server = Object.assign(new Error("Internal Server Error"), { status: 500 });
    userMessage(server);
    userMessage(new Error("No such playlist"));
    userMessage("boom");

    expect(getSnapshot().offline).toBe(false);
    expect(getEngineStatus).not.toHaveBeenCalled();
  });
});
