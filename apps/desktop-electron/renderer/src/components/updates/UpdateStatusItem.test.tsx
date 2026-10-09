/**
 * The update item in the status strip and the panel it opens (DIST-07, DEC-171, DEC-173).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { EngineJobSummary } from "../../api/cuepointBridge.types";
import { installUpdates, updateState, type FakeUpdates } from "../../test/updatesBridge";
import { resetRestart } from "./restartStore";
import { UpdateStatusItem } from "./UpdateStatusItem";

let fake: FakeUpdates;
let jobs: EngineJobSummary[];
let listJobs: ReturnType<typeof vi.fn>;

function importJob(): EngineJobSummary {
  return {
    id: "job-1",
    type: "library_import",
    state: "running",
    created_at: "2026-09-02T10:00:00Z",
    updated_at: "2026-09-02T10:00:00Z",
    progress: { completed_tracks: 3, total_tracks: 10, percentage: 30 },
  };
}

function setup(state = updateState()) {
  listJobs = vi.fn(async () => ({ jobs, active_count: jobs.length }));
  fake = installUpdates(state, { extra: { listJobs } });
  return render(<UpdateStatusItem />);
}

const READY = {
  status: "ready" as const,
  version: "1.0.0-test.2",
  notes: "## Fixed\n\n- The table scrolls",
  progress: 100,
  releaseUrl: "https://github.com/stuchain/CuePoint/releases/tag/v1.0.0-test.2",
};

beforeEach(() => {
  jobs = [];
});

afterEach(() => {
  resetRestart();
  vi.useRealTimers();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the item", () => {
  it.each(["idle", "checking", "up-to-date"] as const)("is not there while %s", async (status) => {
    setup(updateState({ status }));
    await act(async () => {});
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/CuePoint/)).toBeNull();
  });

  it("is not there after a failure", async () => {
    setup(updateState({ status: "failed", error: "could-not-check" }));
    await act(async () => {});
    expect(screen.queryByText(/./)).toBeNull();
  });

  it("is not there without the bridge", () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    render(<UpdateStatusItem />);
    expect(screen.queryByText(/./)).toBeNull();
  });

  it("says what is downloading as polite status text and not a button, with the percentage beside it, not in it", async () => {
    const { container } = setup(updateState({ status: "downloading", version: "1.0.0-test.2", progress: 40 }));
    const text = await screen.findByText("Downloading CuePoint 1.0.0-test.2…");
    expect(text.closest("[aria-live='polite']")).not.toBeNull();
    const percent = screen.getByText("40%");
    expect(percent.closest("[aria-live]")).toBeNull();
    expect(container.querySelector("[aria-live] [role='status']")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not change its announced words when the percentage moves", async () => {
    setup(updateState({ status: "downloading", version: "1.0.0-test.2", progress: 40 }));
    const live = (await screen.findByText("Downloading CuePoint 1.0.0-test.2…")).closest("[aria-live]")!;
    const before = live.textContent;
    act(() => fake.push(updateState({ status: "downloading", version: "1.0.0-test.2", progress: 41 })));
    expect(live.textContent).toBe(before);
    expect(screen.getByText("41%")).toBeInTheDocument();
  });

  it("keeps one live region as the item changes", async () => {
    const { container } = setup(updateState({ status: "downloading", version: "1.0.0-test.2", progress: 40 }));
    await screen.findByText(/Downloading/);
    const region = container.querySelector("[aria-live]");
    act(() => fake.push(updateState({ ...READY })));
    expect(container.querySelector("[aria-live]")).toBe(region);
    expect(region).toHaveTextContent("is ready");
  });

  it("follows the pushes: downloading, then ready", async () => {
    setup(updateState());
    await act(async () => {});
    act(() => fake.push(updateState({ status: "downloading", version: "1.0.0-test.2", progress: 10 })));
    expect(screen.getByText("Downloading CuePoint 1.0.0-test.2…")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
    act(() => fake.push(updateState({ ...READY })));
    expect(screen.getByRole("button", { name: "CuePoint 1.0.0-test.2 is ready" })).toBeInTheDocument();
    expect(screen.queryByText(/Downloading/)).toBeNull();
  });

  it("stops listening when it goes away", async () => {
    const { unmount } = setup(updateState(READY));
    await act(async () => {});
    expect(fake.listeners.size).toBe(1);
    unmount();
    expect(fake.listeners.size).toBe(0);
  });
});

describe("the ready panel", () => {
  it("opens from the item with the notes, Restart now and Later", async () => {
    setup(updateState(READY));
    await userEvent.click(await screen.findByRole("button", { name: "CuePoint 1.0.0-test.2 is ready" }));
    const dialog = await screen.findByRole("dialog", { name: "CuePoint 1.0.0-test.2 is ready" });
    expect(within(dialog).getByRole("heading", { name: "Fixed" })).toBeInTheDocument();
    expect(within(dialog).getByText("The table scrolls")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Restart now" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Later" })).toBeInTheDocument();
  });

  it("says so when there are no notes", async () => {
    setup(updateState({ ...READY, notes: null }));
    await userEvent.click(await screen.findByRole("button", { name: /is ready/ }));
    expect(await screen.findByText("No notes for this version.")).toBeInTheDocument();
  });

  it("restarts through the bridge on Restart now", async () => {
    setup(updateState(READY));
    await userEvent.click(await screen.findByRole("button", { name: /is ready/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Restart now" }));
    await waitFor(() => expect(fake.bridge.restart).toHaveBeenCalledTimes(1));
  });

  it("does not look at running work just because an update is ready", async () => {
    setup(updateState(READY));
    await screen.findByRole("button", { name: /is ready/ });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(listJobs).not.toHaveBeenCalled();
  });

  it("closes on Later and the item stays", async () => {
    setup(updateState(READY));
    await userEvent.click(await screen.findByRole("button", { name: /is ready/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fake.bridge.restart).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "CuePoint 1.0.0-test.2 is ready" })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    setup(updateState(READY));
    await userEvent.click(await screen.findByRole("button", { name: /is ready/ }));
    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fake.bridge.restart).not.toHaveBeenCalled();
  });

  it("opens a link in the notes through the bridge", async () => {
    setup(updateState({ ...READY, notes: "See [the list](https://github.com/stuchain/CuePoint/pull/9)." }));
    await userEvent.click(await screen.findByRole("button", { name: /is ready/ }));
    await userEvent.click(await screen.findByRole("link", { name: "the list" }));
    expect(fake.bridge.openLink).toHaveBeenCalledWith("https://github.com/stuchain/CuePoint/pull/9");
  });
});

describe("work that is running (DEC-173)", () => {
  async function openWithWork() {
    jobs = [importJob()];
    setup(updateState(READY));
    await userEvent.click(await screen.findByRole("button", { name: /is ready/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Restart now" }));
  }

  it("asks first, naming the work and never saying job", async () => {
    await openWithWork();
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/Importing is still running\./)).toBeInTheDocument();
    // Focus is on Cancel, so a second Enter cannot pick "Restart when done".
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus());
    expect(dialog.textContent).not.toMatch(/\bjobs?\b/i);
    expect(within(dialog).getByRole("button", { name: "Restart when done" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(fake.bridge.restart).not.toHaveBeenCalled();
  });

  it("restarts at once on Restart now in the confirm", async () => {
    await openWithWork();
    await userEvent.click(await screen.findByRole("button", { name: "Restart now" }));
    expect(fake.bridge.restart).toHaveBeenCalledTimes(1);
  });

  it("asks, and does not restart, when the work cannot be read", async () => {
    setup(updateState(READY));
    listJobs.mockRejectedValue(new Error("down"));
    await userEvent.click(await screen.findByRole("button", { name: /is ready/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Restart now" }));
    expect(await screen.findByText(/couldn't tell whether work is still running/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restart when done" })).toBeNull();
    expect(fake.bridge.restart).not.toHaveBeenCalled();
  });

  it("keeps capitals in the work it waits for", async () => {
    jobs = [{ ...importJob(), type: "rekordbox_export" }];
    setup(updateState(READY));
    await userEvent.click(await screen.findByRole("button", { name: /is ready/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Restart now" }));
    await userEvent.click(await screen.findByRole("button", { name: "Restart when done" }));
    expect(await screen.findByRole("button", { name: "Restarts when exporting to Rekordbox finishes" })).toBeInTheDocument();
  });

  it("does nothing on Cancel and goes back to the panel", async () => {
    await openWithWork();
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(fake.bridge.restart).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Later" })).toBeInTheDocument();
  });

  it("waits for the work to end, says so in the item, then restarts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    jobs = [importJob()];
    setup(updateState(READY));
    await userEvent.click(await screen.findByRole("button", { name: /is ready/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Restart now" }));
    await userEvent.click(await screen.findByRole("button", { name: "Restart when done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: /Restarts when importing finishes/ })).toBeInTheDocument();
    expect(fake.bridge.restart).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    expect(fake.bridge.restart).not.toHaveBeenCalled();

    jobs = [];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    expect(fake.bridge.restart).toHaveBeenCalledTimes(1);
  });
});

describe("a version that is out but has to be fetched by hand", () => {
  const MANUAL = {
    status: "manual" as const,
    manualReason: "linux" as const,
    version: "1.0.1",
    notes: "- A fix",
    releaseUrl: "https://github.com/stuchain/CuePoint/releases/tag/v1.0.1",
  };

  it("says it is out and offers Download, which opens the release page", async () => {
    setup(updateState(MANUAL));
    await userEvent.click(await screen.findByRole("button", { name: "CuePoint 1.0.1 is out" }));
    const dialog = await screen.findByRole("dialog", { name: "CuePoint 1.0.1 is out" });
    expect(within(dialog).getByText("A fix")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Restart now" })).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Download" }));
    expect(fake.bridge.openReleasePage).toHaveBeenCalledTimes(1);
    expect(fake.bridge.restart).not.toHaveBeenCalled();
  });

  it("closes on Later and the item stays", async () => {
    setup(updateState(MANUAL));
    await userEvent.click(await screen.findByRole("button", { name: /is out/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "CuePoint 1.0.1 is out" })).toBeInTheDocument();
  });
});
