/**
 * Whether a match is running, for every Match button and the line at the top of Clean.
 *
 * Regression: a match started, the person went to another page and came back, and every Match
 * button stayed greyed with no reason, for good. Pages stay alive behind the current one, and
 * React's Activity cleans up a hidden page's effects, which stopped the follower of the job and
 * left "a match is running here" set with nothing left to clear it. The engine's own list of
 * running jobs is the truth, so coming back reads that, not what this page remembered.
 */
import { Activity, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";

import { ToastProvider } from "../../components";
import { resetJobsStoreForTests } from "../../api/jobsStore";
import { secondsLeftOf, useCleanMatch, type CleanMatch } from "./useCleanMatch";

type Fn = ReturnType<typeof vi.fn>;
let bridge: Record<string, Fn>;
let latest: CleanMatch;
let running: Array<{ id: string; type: string; state: string; progress?: Record<string, number> }>;

function Probe() {
  latest = useCleanMatch(() => undefined);
  return null;
}

function Page({ mode, children }: { mode: "visible" | "hidden"; children: ReactNode }) {
  return (
    <ToastProvider>
      <Activity mode={mode}>{children}</Activity>
    </ToastProvider>
  );
}

beforeEach(() => {
  resetJobsStoreForTests();
  running = [];
  bridge = {
    listJobs: vi.fn(async () => ({ jobs: running, active_count: running.length })),
    startCleanMatch: vi.fn().mockResolvedValue({ job_id: "m1", id: "m1", state: "queued", selected: 24, excluded: 0, planned: 24, resumed_from: null }),
    // The job never reaches an end this page can see.
    getJob: vi.fn().mockResolvedValue({ id: "m1", state: "running" }),
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  resetJobsStoreForTests();
});

describe("useCleanMatch after the page was hidden", () => {
  it("is not matching once the engine runs no match, though one was started here and the page was left", async () => {
    const view = render(
      <Page mode="visible">
        <Probe />
      </Page>,
    );
    await act(async () => {
      await latest.start("match-many", { track_ids: [1, 2] }, false, "hJ");
    });
    expect(latest.matching).toBe(true);

    // Leave the page: its effects are cleaned up, and the job's follower with them.
    view.rerender(
      <Page mode="hidden">
        <Probe />
      </Page>,
    );
    // The match ends while away; the engine lists nothing running.
    running = [];
    view.rerender(
      <Page mode="visible">
        <Probe />
      </Page>,
    );

    await waitFor(() => expect(latest.matching).toBe(false));
    expect(latest.running).toBeNull();
  });

  it("is matching while the engine lists a running match, started anywhere", async () => {
    running = [
      { id: "m2", type: "clean_match", state: "running", progress: { completed_tracks: 3, total_tracks: 24 } },
    ];
    render(
      <Page mode="visible">
        <Probe />
      </Page>,
    );
    await waitFor(() => expect(latest.matching).toBe(true));
    expect(latest.jobId).toBe("m2");
    expect(latest.progress).toEqual({ done: 3, total: 24 });
  });

  it("is not matching for a job that is not a match, such as the duplicate scan that follows one", async () => {
    running = [{ id: "d1", type: "duplicate_scan", state: "running" }];
    render(
      <Page mode="visible">
        <Probe />
      </Page>,
    );
    await waitFor(() => expect(bridge.listJobs).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(latest.matching).toBe(false);
  });
});

describe("the name of the running match", () => {
  it("belongs to the job it started: another match running now is not called by it", async () => {
    // The engine runs a match started somewhere else, m9, while this page starts hJ as m1.
    running = [{ id: "m9", type: "clean_match", state: "running", progress: { completed_tracks: 1, total_tracks: 5 } }];
    render(
      <Page mode="visible">
        <Probe />
      </Page>,
    );
    await waitFor(() => expect(latest.jobId).toBe("m9"));
    await act(async () => {
      await latest.start("match-many", { track_ids: [1] }, false, "hJ");
    });
    expect(latest.jobId).toBe("m9");
    expect(latest.label).toBeNull();
  });

  it("is kept for the job that was started", async () => {
    running = [{ id: "m1", type: "clean_match", state: "running", progress: { completed_tracks: 1, total_tracks: 5 } }];
    render(
      <Page mode="visible">
        <Probe />
      </Page>,
    );
    await act(async () => {
      await latest.start("match-many", { track_ids: [1] }, false, "hJ");
    });
    await waitFor(() => expect(latest.jobId).toBe("m1"));
    expect(latest.label).toBe("hJ");
  });
});

describe("secondsLeftOf", () => {
  it("scales the time the tracks done took to the tracks left", () => {
    expect(secondsLeftOf({ done: 11, total: 24 }, 110)).toBe(130);
  });

  it("says nothing before a few tracks are done, or without a time, or when all are", () => {
    expect(secondsLeftOf({ done: 2, total: 24 }, 40)).toBeNull();
    expect(secondsLeftOf({ done: 11, total: 24 }, undefined)).toBeNull();
    expect(secondsLeftOf({ done: 11, total: 24 }, 0)).toBeNull();
    expect(secondsLeftOf({ done: 24, total: 24 }, 300)).toBeNull();
  });
});
