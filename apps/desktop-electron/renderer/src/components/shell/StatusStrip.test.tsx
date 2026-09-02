/**
 * Status strip (SHELL-07, DEC-026).
 *
 * Two failures these tests exist to prevent. First, engine state going stale:
 * the banner this replaces read the status once on mount and never again, and
 * a mocked-bridge test that only checks the first render would pass against
 * exactly that bug — so the tests here advance time and assert the strip
 * changed. Second, a job started elsewhere going unnoticed: the strip has to
 * discover jobs it did not start, including one that outlived a reload.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { StatusStrip } from "./StatusStrip";
import type { EngineJobSummary } from "../../api/cuepointBridge.types";

function job(overrides: Partial<EngineJobSummary> = {}): EngineJobSummary {
  return {
    id: "job-1",
    type: "match",
    state: "running",
    created_at: "2026-09-02T10:00:00Z",
    updated_at: "2026-09-02T10:00:00Z",
    progress: { completed_tracks: 3, total_tracks: 10, percentage: 30 },
    ...overrides,
  };
}

let getEngineStatus: ReturnType<typeof vi.fn>;
let listJobs: ReturnType<typeof vi.fn>;
let subscribeJobEvents: ReturnType<typeof vi.fn>;
let sseHandler: ((event: unknown) => void) | null;
let unsubscribed: number;

function bridge(overrides: Record<string, unknown> = {}) {
  (window as unknown as { cuepoint?: unknown }).cuepoint = {
    getEngineStatus,
    listJobs,
    subscribeJobEvents,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  sseHandler = null;
  unsubscribed = 0;
  getEngineStatus = vi.fn().mockResolvedValue({ connected: true, version: "1.0.0" });
  listJobs = vi.fn().mockResolvedValue({ jobs: [], active_count: 0 });
  subscribeJobEvents = vi.fn((_id: string, onEvent: (event: unknown) => void) => {
    sseHandler = onEvent;
    return () => {
      unsubscribed += 1;
      sseHandler = null;
    };
  });
  bridge();
});

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("engine state", () => {
  it("reports a connected engine with its version", async () => {
    render(<StatusStrip />);
    expect(await screen.findByText(/Engine connected · v1\.0\.0/)).toBeInTheDocument();
  });

  it("reports a disconnected engine and why", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });

    render(<StatusStrip />);

    expect(await screen.findByText(/Engine offline: Engine not running/)).toBeInTheDocument();
  });

  it("notices the engine going down without a remount", async () => {
    // The carried-in obligation. The component this replaces would pass a test
    // that only checked the first render, because it read the status once and
    // then never again.
    render(<StatusStrip />);
    await screen.findByText(/Engine connected/);

    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });
    await vi.advanceTimersByTimeAsync(4100);

    await waitFor(() => expect(screen.getByText(/Engine offline/)).toBeInTheDocument());
  });

  it("notices the engine coming back without a remount", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });
    render(<StatusStrip />);
    await screen.findByText(/Engine offline/);

    getEngineStatus.mockResolvedValue({ connected: true, version: "1.0.0" });
    await vi.advanceTimersByTimeAsync(4100);

    await waitFor(() => expect(screen.getByText(/Engine connected/)).toBeInTheDocument());
  });

  it("treats a failed status read as the engine being unreachable", async () => {
    getEngineStatus.mockRejectedValue(new Error("ipc gone"));

    render(<StatusStrip />);

    expect(await screen.findByText(/Engine offline: Engine unreachable/)).toBeInTheDocument();
  });

  it("says the state is unknown when there is no bridge at all", () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;

    render(<StatusStrip />);

    expect(screen.getByText(/Engine status unknown/)).toBeInTheDocument();
  });
});

describe("jobs", () => {
  it("says so when nothing is running", async () => {
    render(<StatusStrip />);
    expect(await screen.findByText("No jobs running")).toBeInTheDocument();
  });

  it("shows a running job with its progress", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });

    render(<StatusStrip />);

    expect(await screen.findByText("Matching 3/10")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /job progress/i })).toHaveAttribute(
      "value",
      "30",
    );
  });

  it("picks up a job it never started, as after a reload", async () => {
    // The reason the list endpoint exists: this job's id was never handed to
    // this renderer.
    listJobs.mockResolvedValue({ jobs: [job({ id: "started-before-reload" })], active_count: 1 });

    render(<StatusStrip />);

    expect(await screen.findByText(/Matching/)).toBeInTheDocument();
    expect(listJobs).toHaveBeenCalledWith({ state: "active", limit: 5 });
  });

  it("notices a job that starts after the strip mounted", async () => {
    render(<StatusStrip />);
    await screen.findByText("No jobs running");

    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    await vi.advanceTimersByTimeAsync(4100);

    await waitFor(() => expect(screen.getByText("Matching 3/10")).toBeInTheDocument());
  });

  it("follows progress over SSE rather than by polling", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    render(<StatusStrip />);
    await screen.findByText("Matching 3/10");

    sseHandler?.({
      id: "job-1",
      state: "running",
      progress: { completed_tracks: 8, total_tracks: 10, percentage: 80 },
    });

    await waitFor(() => expect(screen.getByText("Matching 8/10")).toBeInTheDocument());
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("ignores an event for a different job", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    render(<StatusStrip />);
    await screen.findByText("Matching 3/10");

    sseHandler?.({
      id: "someone-elses-job",
      state: "running",
      progress: { completed_tracks: 9, total_tracks: 10, percentage: 90 },
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(screen.getByText("Matching 3/10")).toBeInTheDocument();
  });

  it("says how many other jobs are running", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 3 });

    render(<StatusStrip />);

    expect(await screen.findByText("+2 more")).toBeInTheDocument();
  });

  it("shows a queued job as queued", async () => {
    listJobs.mockResolvedValue({
      jobs: [job({ state: "queued", progress: undefined })],
      active_count: 1,
    });

    render(<StatusStrip />);

    expect(await screen.findByText("Queued")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("stops following a job once it finishes", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    render(<StatusStrip />);
    await screen.findByText("Matching 3/10");

    listJobs.mockResolvedValue({ jobs: [], active_count: 0 });
    await vi.advanceTimersByTimeAsync(4100);

    await waitFor(() => expect(screen.getByText("No jobs running")).toBeInTheDocument());
    expect(unsubscribed).toBeGreaterThan(0);
  });

  it("stops polling when unmounted", async () => {
    const { unmount } = render(<StatusStrip />);
    await screen.findByText("No jobs running");
    const callsBefore = listJobs.mock.calls.length;

    unmount();
    await vi.advanceTimersByTimeAsync(12_000);

    expect(listJobs.mock.calls.length).toBe(callsBefore);
  });

  it("survives a bridge with no job listing", async () => {
    // An older preload, or the renderer in a browser tab.
    bridge({ listJobs: undefined });

    render(<StatusStrip />);

    expect(await screen.findByText("No jobs running")).toBeInTheDocument();
  });
});
