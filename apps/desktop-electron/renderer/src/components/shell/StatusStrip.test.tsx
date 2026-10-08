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
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StatusStrip } from "./StatusStrip";
import { JOB_EXPLAINERS } from "./useActiveJob";
import type { EngineJobSummary } from "../../api/cuepointBridge.types";

function job(overrides: Partial<EngineJobSummary> = {}): EngineJobSummary {
  return {
    id: "job-1",
    type: "clean_match",
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

/**
 * The job stream, once the strip has subscribed to it.
 *
 * The strip subscribes in an effect after the job first renders, so the label
 * can be on screen before there is anything to send an event to. Sending one
 * then did nothing, which a loaded machine turned into a failure and which made
 * "ignores an event for a different job" pass without sending anything.
 */
async function stream(): Promise<(event: unknown) => void> {
  await waitFor(() => expect(sseHandler).not.toBeNull());
  return sseHandler!;
}

afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("engine state", () => {
  it("says Ready when connected, and leaves the version out (STR-1)", async () => {
    render(<StatusStrip />);
    expect(await screen.findByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText(/1\.0\.0/)).not.toBeInTheDocument();
  });

  it("says the library service stopped, with the raw reason only in a title", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });

    render(<StatusStrip />);

    const text = await screen.findByText("CuePoint's library service stopped");
    expect(text).toHaveAttribute("title", "Engine not running");
    expect(screen.queryByText(/Engine not running/)).not.toBeInTheDocument();
  });

  it("says it is starting up rather than ready, before it answers", async () => {
    // The bug this pins, found by the Phase 8 macOS pass. A packaged macOS
    // engine is a PyInstaller one-file build that takes about ten seconds to
    // unpack and answer on a cold start, and the supervisor called it
    // connected the moment the child was spawned. For those ten seconds the
    // strip said "Engine connected" while every call through it failed.
    getEngineStatus.mockResolvedValue({ connected: false, starting: true, error: "Starting" });

    render(<StatusStrip />);

    expect(await screen.findByText("Starting up…")).toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
    expect(screen.queryByText(/library service stopped/)).not.toBeInTheDocument();
  });

  it("does not offer Restart library service to an engine that is still starting", async () => {
    // Restarting an engine that is merely slow to unpack sets it back to the
    // beginning, which is the opposite of what the person wanted.
    bridge({ restartEngine: vi.fn() });
    getEngineStatus.mockResolvedValue({ connected: false, starting: true, error: "Starting" });

    render(<StatusStrip />);
    await screen.findByText("Starting up…");

    expect(screen.queryByRole("button", { name: /restart library service/i })).not.toBeInTheDocument();
  });

  it("still offers Restart library service to an engine that is simply not there", async () => {
    bridge({ restartEngine: vi.fn() });
    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });

    render(<StatusStrip />);
    await screen.findByText(/library service stopped/);

    expect(screen.getByRole("button", { name: /restart library service/i })).toBeInTheDocument();
  });

  it("goes from starting to connected without a remount", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, starting: true, error: "Starting" });
    render(<StatusStrip />);
    await screen.findByText("Starting up…");

    getEngineStatus.mockResolvedValue({ connected: true, version: "1.0.0" });
    await vi.advanceTimersByTimeAsync(4100);

    await waitFor(() => expect(screen.getByText("Ready")).toBeInTheDocument());
  });

  it("notices the engine going down without a remount", async () => {
    // The carried-in obligation. The component this replaces would pass a test
    // that only checked the first render, because it read the status once and
    // then never again.
    render(<StatusStrip />);
    await screen.findByText("Ready");

    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });
    await vi.advanceTimersByTimeAsync(4100);

    await waitFor(() => expect(screen.getByText(/library service stopped/)).toBeInTheDocument());
  });

  it("notices the engine coming back without a remount", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, error: "Engine not running" });
    render(<StatusStrip />);
    await screen.findByText(/library service stopped/);

    getEngineStatus.mockResolvedValue({ connected: true, version: "1.0.0" });
    await vi.advanceTimersByTimeAsync(4100);

    await waitFor(() => expect(screen.getByText("Ready")).toBeInTheDocument());
  });

  it("treats a failed status read as the engine being unreachable", async () => {
    getEngineStatus.mockRejectedValue(new Error("ipc gone"));

    render(<StatusStrip />);

    expect(await screen.findByText(/library service stopped/)).toBeInTheDocument();
  });

  it("says the state is unknown when there is no bridge at all", () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;

    render(<StatusStrip />);

    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });
});

describe("engine recovery (DEC-028)", () => {
  it("says it is reconnecting rather than stopped while restarts are in flight", async () => {
    // The two mean different things to someone deciding whether to act.
    getEngineStatus.mockResolvedValue({
      connected: false,
      reconnecting: true,
      restartAttempts: 2,
      error: "Reconnecting",
    });

    render(<StatusStrip />);

    expect(
      await screen.findByText("Reconnecting… (attempt 2 of 3)"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/library service stopped/)).not.toBeInTheDocument();
  });

  it("shows how many attempts have been made", async () => {
    getEngineStatus.mockResolvedValue({
      connected: false,
      reconnecting: true,
      restartAttempts: 2,
    });

    render(<StatusStrip />);

    expect(await screen.findByText(/\(attempt 2 of 3\)/)).toBeInTheDocument();
  });

  it("offers no restart control while reconnecting", async () => {
    getEngineStatus.mockResolvedValue({ connected: false, reconnecting: true });
    bridge({ restartEngine: vi.fn() });

    render(<StatusStrip />);
    await screen.findByText(/Reconnecting/);

    expect(screen.queryByRole("button", { name: /restart library service/i })).not.toBeInTheDocument();
  });

  it("offers the restart control once the attempts have given up", async () => {
    getEngineStatus.mockResolvedValue({
      connected: false,
      reconnecting: false,
      error: "Engine not running",
    });
    bridge({ restartEngine: vi.fn() });

    render(<StatusStrip />);

    expect(
      await screen.findByRole("button", { name: /restart library service/i }),
    ).toBeInTheDocument();
  });

  it("offers no restart control when the engine is healthy", async () => {
    bridge({ restartEngine: vi.fn() });
    render(<StatusStrip />);
    await screen.findByText("Ready");

    expect(screen.queryByRole("button", { name: /restart library service/i })).not.toBeInTheDocument();
  });

  it("restarts the engine when the control is pressed", async () => {
    const restartEngine = vi.fn().mockResolvedValue({ connected: true });
    getEngineStatus.mockResolvedValue({ connected: false, reconnecting: false });
    bridge({ restartEngine });

    render(<StatusStrip />);
    const button = await screen.findByRole("button", { name: /restart library service/i });
    button.click();

    await waitFor(() => expect(restartEngine).toHaveBeenCalledTimes(1));
  });

  it("offers nothing when the bridge cannot restart", async () => {
    // An older preload, or the renderer in a browser tab.
    getEngineStatus.mockResolvedValue({ connected: false, reconnecting: false });
    bridge({ restartEngine: undefined });

    render(<StatusStrip />);
    await screen.findByText(/library service stopped/);

    expect(screen.queryByRole("button", { name: /restart library service/i })).not.toBeInTheDocument();
  });
});

describe("background work", () => {
  it("shows nothing when nothing is running (STR-2)", async () => {
    render(<StatusStrip />);
    await screen.findByText("Ready");
    expect(screen.queryByText(/no jobs|jobs running/i)).not.toBeInTheDocument();
    expect(document.querySelector(".cp-status__idle")).toBeNull();
  });

  it("shows a running job with its progress", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });

    render(<StatusStrip />);

    expect(await screen.findByText("Matching on Beatport · 3 of 10")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: /progress/i })).toHaveAttribute(
      "value",
      "30",
    );
  });

  it("picks up work it never started, as after a reload", async () => {
    // The reason the list endpoint exists: this job's id was never handed to
    // this renderer.
    listJobs.mockResolvedValue({ jobs: [job({ id: "started-before-reload" })], active_count: 1 });

    render(<StatusStrip />);

    expect(await screen.findByText(/Matching/)).toBeInTheDocument();
    expect(listJobs).toHaveBeenCalledWith({ state: "active", limit: 5 });
  });

  it("notices a job that starts after the strip mounted", async () => {
    render(<StatusStrip />);
    await screen.findByText("Ready");

    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    await vi.advanceTimersByTimeAsync(4100);

    await waitFor(() => expect(screen.getByText("Matching on Beatport · 3 of 10")).toBeInTheDocument());
  });

  it("follows progress over SSE rather than by polling", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    render(<StatusStrip />);
    await screen.findByText("Matching on Beatport · 3 of 10");

    // From here on the discovery poll never answers, so the only way 8/10 can
    // reach the strip is the SSE event. Left answering, the fixture's 3/10
    // came back on the next 2s poll and overwrote the tick whenever a loaded
    // machine let real time cross a poll before the assertion ran (the fake
    // clock advances with real time), which is why this failed only in full
    // runs.
    listJobs.mockReturnValue(new Promise(() => {}));

    (await stream())({
      id: "job-1",
      state: "running",
      progress: { completed_tracks: 8, total_tracks: 10, percentage: 80 },
    });

    await waitFor(() => expect(screen.getByText("Matching on Beatport · 8 of 10")).toBeInTheDocument());
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("ignores an event for a different job", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    render(<StatusStrip />);
    await screen.findByText("Matching on Beatport · 3 of 10");

    (await stream())({
      id: "someone-elses-job",
      state: "running",
      progress: { completed_tracks: 9, total_tracks: 10, percentage: 90 },
    });

    await vi.advanceTimersByTimeAsync(50);
    expect(screen.getByText("Matching on Beatport · 3 of 10")).toBeInTheDocument();
  });

  it("says how many other things are running", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 3 });

    render(<StatusStrip />);

    expect(await screen.findByRole("button", { name: "+2 more" })).toBeInTheDocument();
  });

  it("shows a queued job as queued", async () => {
    listJobs.mockResolvedValue({
      jobs: [job({ state: "queued", progress: undefined })],
      active_count: 1,
    });

    render(<StatusStrip />);

    expect(await screen.findByText("Waiting to start")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("stops following a job once it finishes", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    render(<StatusStrip />);
    await screen.findByText("Matching on Beatport · 3 of 10");

    listJobs.mockResolvedValue({ jobs: [], active_count: 0 });
    await vi.advanceTimersByTimeAsync(4100);

    await waitFor(() =>
      expect(screen.queryByText(/Matching/)).not.toBeInTheDocument(),
    );
    expect(unsubscribed).toBeGreaterThan(0);
  });

  it("stops polling when unmounted", async () => {
    const { unmount } = render(<StatusStrip />);
    await screen.findByText("Ready");
    const callsBefore = listJobs.mock.calls.length;

    unmount();
    await vi.advanceTimersByTimeAsync(12_000);

    expect(listJobs.mock.calls.length).toBe(callsBefore);
  });

  it("survives a bridge with no job listing", async () => {
    // An older preload, or the renderer in a browser tab.
    bridge({ listJobs: undefined });

    render(<StatusStrip />);

    expect(await screen.findByText("Ready")).toBeInTheDocument();
  });
});

/**
 * Stopping the job the strip is reporting (ORG-13).
 *
 * The engine has had one cancel since Phase 1 and every job type checks it,
 * but the only way to reach it was inKey's own button — so a batch over
 * everything a query matches was a cancellable job with nothing to cancel it.
 * It belongs here because this is where a running job is visible from anywhere
 * in the app, which is the point of it being a job at all.
 */
describe("stopping a job", () => {
  let cancelJob: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cancelJob = vi.fn().mockResolvedValue({ id: "job-1", state: "cancelled" });
  });

  it("is offered for a job that is running", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    bridge({ cancelJob });

    render(<StatusStrip />);

    expect(await screen.findByRole("button", { name: /stop matching/i })).toBeEnabled();
  });

  it("names the work rather than saying only 'stop'", async () => {
    // The strip reports five kinds of work; "Cancel" alone would not say which
    // one a click stops.
    listJobs.mockResolvedValue({
      jobs: [job({ type: "library_batch", progress: undefined })],
      active_count: 1,
    });
    bridge({ cancelJob });

    render(<StatusStrip />);

    expect(
      await screen.findByRole("button", { name: "Stop updating tracks" }),
    ).toBeInTheDocument();
  });

  it("gives a batch its own verb rather than the unknown-job fallback", async () => {
    // "Working" is what the strip says about a job type it has never heard of,
    // and this build writes them (ORG-07).
    listJobs.mockResolvedValue({
      jobs: [job({ type: "library_batch" })],
      active_count: 1,
    });

    render(<StatusStrip />);

    expect(await screen.findByText("Updating 10 tracks")).toBeInTheDocument();
  });

  it("pauses the waveform analysis rather than stopping it (WAVE-03)", async () => {
    listJobs.mockResolvedValue({
      jobs: [
        job({
          id: "job-9",
          type: "waveform_analysis",
          progress: { completed_tracks: 1234, total_tracks: 50000, eta_seconds: 6 * 3600 },
        }),
      ],
      active_count: 1,
    });
    bridge({ cancelJob });
    render(<StatusStrip />);

    const label = await screen.findByText("Analyzing waveforms · 1,234 of 50,000");
    const pause = screen.getByRole("button", {
      name: "Pause analyzing waveforms · 1,234 of 50,000",
    });
    expect(pause).toHaveTextContent("Pause");
    expect(label).toHaveAttribute(
      "title",
      expect.stringContaining("About 8,128 an hour · about 6 hours left"),
    );
    pause.click();

    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith("job-9"));
  });

  it("asks CuePoint to stop that work", async () => {
    listJobs.mockResolvedValue({ jobs: [job({ id: "job-7" })], active_count: 1 });
    bridge({ cancelJob });
    render(<StatusStrip />);

    (await screen.findByRole("button", { name: /stop matching/i })).click();

    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith("job-7"));
  });

  it("is not offered for a job that has already finished", async () => {
    // Cancelling a finished job is a request the engine answers by doing
    // nothing, and a button that does nothing is worse than no button.
    listJobs.mockResolvedValue({ jobs: [job({ state: "succeeded" })], active_count: 1 });
    bridge({ cancelJob });

    render(<StatusStrip />);

    await screen.findByText(/Matching/);
    expect(screen.queryByRole("button", { name: /stop/i })).toBeNull();
  });

  it("is not offered by a build whose bridge cannot cancel", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });

    render(<StatusStrip />);

    await screen.findByText("Matching on Beatport · 3 of 10");
    expect(screen.queryByRole("button", { name: /stop/i })).toBeNull();
  });

  it("survives a cancel that is refused", async () => {
    // The job carries on and the strip keeps saying so, which is the honest
    // outcome — an error of its own would be reporting a second problem.
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    bridge({ cancelJob: vi.fn().mockRejectedValue(new Error("gone")) });
    render(<StatusStrip />);

    const stop = await screen.findByRole("button", { name: /stop matching/i });
    stop.click();

    await waitFor(() => expect(stop).toBeEnabled());
    expect(screen.getByText("Matching on Beatport · 3 of 10")).toBeInTheDocument();
  });
});

describe("the reason for the work (STR-3, Hint)", () => {
  it("is on the label as a title and shown while the label has focus", async () => {
    listJobs.mockResolvedValue({ jobs: [job({ type: "library_import" })], active_count: 1 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StatusStrip />);

    const label = await screen.findByText("Importing · 3 of 10");
    expect(label).toHaveAttribute("title", JOB_EXPLAINERS.library_import);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.tab();
    while (document.activeElement !== label) await user.tab();

    expect(screen.getByRole("tooltip")).toHaveTextContent(JOB_EXPLAINERS.library_import);
    expect(label).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
  });
});

describe("the Activity button (STR-9)", () => {
  it("says what it opens and its shortcut, on hover and on focus", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StatusStrip />);
    const button = screen.getByRole("button", { name: "Activity" });

    expect(button).toHaveAttribute(
      "title",
      "Activity: what CuePoint has done (Ctrl+Shift+A)",
    );
    await user.tab();
    while (document.activeElement !== button) await user.tab();
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Activity: what CuePoint has done (Ctrl+Shift+A)",
    );
  });

  it("carries no unread badge", () => {
    render(<StatusStrip />);
    expect(screen.getByRole("button", { name: "Activity" })).toHaveTextContent(/^Activity$/);
  });
});

describe("+N more (STR-5)", () => {
  const three = [
    job({ id: "a", type: "library_import" }),
    job({ id: "b", type: "waveform_analysis", progress: { completed_tracks: 5, total_tracks: 20 } }),
    job({ id: "c", type: "file_check", state: "queued", progress: undefined }),
  ];

  it("is a button that opens the list of everything running", async () => {
    listJobs.mockResolvedValue({ jobs: three, active_count: 3 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    bridge({ cancelJob: vi.fn() });
    render(<StatusStrip />);

    const more = await screen.findByRole("button", { name: "+2 more" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);

    const list = screen.getByRole("dialog", { name: "Running now" });
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(within(list).getByText("Importing · 3 of 10")).toBeInTheDocument();
    expect(within(list).getByText("Analyzing waveforms · 5 of 20")).toBeInTheDocument();
    expect(within(list).getByText("Waiting to start")).toBeInTheDocument();
    // Stop only where the job can be stopped: a running job, not a waiting one.
    expect(within(list).getByRole("button", { name: /^Stop importing/ })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /^Pause analyzing waveforms/ })).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: /checking files/i })).not.toBeInTheDocument();
  });

  it("stops one of the listed jobs", async () => {
    listJobs.mockResolvedValue({ jobs: three, active_count: 3 });
    const cancelJob = vi.fn().mockResolvedValue({});
    bridge({ cancelJob });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StatusStrip />);

    await user.click(await screen.findByRole("button", { name: "+2 more" }));
    const list = screen.getByRole("dialog", { name: "Running now" });
    await user.click(within(list).getByRole("button", { name: /^Pause analyzing waveforms/ }));

    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith("b"));
  });

  it("closes on Escape and returns focus to the button", async () => {
    listJobs.mockResolvedValue({ jobs: three, active_count: 3 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StatusStrip />);

    const more = await screen.findByRole("button", { name: "+2 more" });
    await user.click(more);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Running now" })).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it("closes on a click outside it", async () => {
    listJobs.mockResolvedValue({ jobs: three, active_count: 3 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <>
        <button type="button">Elsewhere</button>
        <StatusStrip />
      </>,
    );

    await user.click(await screen.findByRole("button", { name: "+2 more" }));
    expect(screen.getByRole("dialog", { name: "Running now" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));

    expect(screen.queryByRole("dialog", { name: "Running now" })).not.toBeInTheDocument();
  });

  it("does not reopen by itself after the work dropped to one and grew again", async () => {
    listJobs.mockResolvedValue({ jobs: three, active_count: 3 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StatusStrip />);

    await user.click(await screen.findByRole("button", { name: "+2 more" }));
    expect(screen.getByRole("dialog", { name: "Running now" })).toBeInTheDocument();

    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    await vi.advanceTimersByTimeAsync(4100);
    await waitFor(() => expect(screen.queryByRole("button", { name: /more/ })).not.toBeInTheDocument());

    listJobs.mockResolvedValue({ jobs: three, active_count: 3 });
    await vi.advanceTimersByTimeAsync(4100);
    const more = await screen.findByRole("button", { name: "+2 more" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "Running now" })).not.toBeInTheDocument();
  });

  it("keeps the running list and the tooltip out of the live region", async () => {
    listJobs.mockResolvedValue({ jobs: three, active_count: 3 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<StatusStrip />);

    await user.click(await screen.findByRole("button", { name: "+2 more" }));
    const live = screen.getByRole("status");
    expect(live).not.toContainElement(screen.getByRole("dialog", { name: "Running now" }));
    await user.tab();
    const tips = screen.queryAllByRole("tooltip");
    for (const tip of tips) expect(live).not.toContainElement(tip);
  });

  it("is not there when only one thing is running", async () => {
    listJobs.mockResolvedValue({ jobs: [job()], active_count: 1 });
    render(<StatusStrip />);
    await screen.findByText("Matching on Beatport · 3 of 10");
    expect(screen.queryByRole("button", { name: /more/ })).not.toBeInTheDocument();
  });
});
