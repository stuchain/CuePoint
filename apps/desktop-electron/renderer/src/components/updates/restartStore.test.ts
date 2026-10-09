/**
 * Restarting to install an update while work runs (DEC-173): one store, one watcher, one restart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EngineJobSummary } from "../../api/cuepointBridge.types";
import {
  cancelRestart,
  getRestartSnapshot,
  requestRestart,
  resetRestart,
  restartNow,
  restartWhenDone,
  stopWaiting,
  subscribeRestart,
  whenWorkEnds,
} from "./restartStore";

function job(id: string, type = "library_import"): EngineJobSummary {
  return {
    id,
    type,
    state: "running",
    created_at: "x",
    updated_at: "x",
    progress: { completed_tracks: 1, total_tracks: 4, percentage: 25 },
  };
}

let active: EngineJobSummary[];
let listJobs: ReturnType<typeof vi.fn>;
let restart: ReturnType<typeof vi.fn>;

function install(extra: Record<string, unknown> = {}) {
  listJobs = vi.fn(async () => ({ jobs: active, active_count: active.length }));
  restart = vi.fn(async () => true);
  (window as unknown as { cuepoint?: unknown }).cuepoint = { listJobs, updates: { restart }, ...extra };
}

async function tick(ms = 2100) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  active = [];
  install();
});

afterEach(() => {
  resetRestart();
  vi.useRealTimers();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("requestRestart", () => {
  it("restarts at once when nothing is running", async () => {
    await requestRestart();
    expect(restart).toHaveBeenCalledTimes(1);
    expect(getRestartSnapshot().phase).toBe("idle");
  });

  it("asks first, naming the work, when something runs", async () => {
    active = [job("a")];
    await requestRestart();
    expect(restart).not.toHaveBeenCalled();
    expect(getRestartSnapshot()).toMatchObject({ phase: "confirming", work: "Importing", unknown: false });
  });

  it("calls several things background work", async () => {
    active = [job("a"), job("b", "file_check")];
    await requestRestart();
    expect(getRestartSnapshot().work).toBe("Background work");
  });

  it("asks, and never restarts at once, when it cannot tell what runs", async () => {
    listJobs.mockRejectedValue(new Error("down"));
    await requestRestart();
    expect(restart).not.toHaveBeenCalled();
    expect(getRestartSnapshot()).toMatchObject({ phase: "confirming", unknown: true });
  });

  it("asks when there is no way to tell", async () => {
    install();
    delete (window as unknown as { cuepoint: { listJobs?: unknown } }).cuepoint.listJobs;
    await requestRestart();
    expect(restart).not.toHaveBeenCalled();
    expect(getRestartSnapshot().unknown).toBe(true);
  });

  it("restarts once however many times it is asked", async () => {
    await Promise.all([requestRestart(), requestRestart()]);
    restartNow();
    expect(restart).toHaveBeenCalledTimes(1);
  });
});

describe("the question", () => {
  it("Restart now restarts at once", async () => {
    active = [job("a")];
    await requestRestart();
    restartNow();
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("Cancel leaves it and stops watching", async () => {
    active = [job("a")];
    await requestRestart();
    cancelRestart();
    expect(getRestartSnapshot().phase).toBe("idle");
    const calls = listJobs.mock.calls.length;
    await tick(10_000);
    expect(listJobs.mock.calls.length).toBe(calls);
    expect(restart).not.toHaveBeenCalled();
  });
});

describe("restart when done", () => {
  it("waits for the work that was running, then restarts once", async () => {
    active = [job("a")];
    await requestRestart();
    restartWhenDone();
    expect(getRestartSnapshot()).toMatchObject({ phase: "waiting", work: "Importing" });
    await tick();
    expect(restart).not.toHaveBeenCalled();
    active = [];
    await tick();
    await tick();
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("does not wait for the work that follows it", async () => {
    active = [job("a")];
    await requestRestart();
    restartWhenDone();
    active = [job("b", "file_check")];
    await tick();
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting when it cannot read the work", async () => {
    active = [job("a")];
    await requestRestart();
    restartWhenDone();
    listJobs.mockRejectedValue(new Error("down"));
    await tick(10_000);
    expect(restart).not.toHaveBeenCalled();
    expect(getRestartSnapshot().phase).toBe("waiting");
  });

  it("stops waiting on request and watches no more", async () => {
    active = [job("a")];
    await requestRestart();
    restartWhenDone();
    stopWaiting();
    const calls = listJobs.mock.calls.length;
    active = [];
    await tick(10_000);
    expect(listJobs.mock.calls.length).toBe(calls);
    expect(restart).not.toHaveBeenCalled();
  });

  it("is told to every listener, so two screens agree", async () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeRestart(a);
    const offB = subscribeRestart(b);
    active = [job("a")];
    await requestRestart();
    restartWhenDone();
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    offA();
    offB();
  });

  it("can ask again when the restart did not start", async () => {
    restart.mockResolvedValueOnce(false);
    restartNow();
    await vi.advanceTimersByTimeAsync(0);
    restartNow();
    expect(restart).toHaveBeenCalledTimes(2);
  });
});

describe("whenWorkEnds", () => {
  it("lowercases only the first letter", () => {
    expect(whenWorkEnds("Exporting to Rekordbox")).toBe("Restarts when exporting to Rekordbox finishes");
    expect(whenWorkEnds("Matching on Beatport")).toBe("Restarts when matching on Beatport finishes");
    expect(whenWorkEnds(null)).toBe("Restarts when CuePoint's current work finishes");
  });
});
