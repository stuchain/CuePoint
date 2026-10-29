/**
 * The strip's own messages (HARDEN-03, HARDEN-05, DEC-305): a full disk in the error look, and the
 * once-only notes in the place of "Ready". The words are the owner's, from the mockup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import { resetEngineOnlineForTests } from "../../api/engineOnline";
import { noteDiskFull, showStripNotice } from "../../api/stripMessages";
import { waitThenRestore } from "../../screens/backups/restoreStore";
import { MotionProvider } from "../../tokens/MotionContext";
import { resetActivityForTests } from "./activityState";
import { StatusStrip } from "./StatusStrip";
import { resetStartupNoticesForTests, useStartupNotices } from "./useStartupNotices";

function Notices() {
  useStartupNotices();
  return null;
}

function renderStrip() {
  return render(
    <MotionProvider>
      <Notices />
      <StatusStrip />
    </MotionProvider>,
  );
}

let bridge: Record<string, unknown>;

beforeEach(() => {
  localStorage.setItem("cuepoint-onboarding-complete", "1");
  sessionStorage.clear();
  resetStartupNoticesForTests();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  bridge = {
    getEngineStatus: vi.fn().mockResolvedValue({ connected: true, version: "1.0.0" }),
    listJobs: vi.fn().mockResolvedValue({ jobs: [], active_count: 0 }),
    subscribeJobEvents: vi.fn(() => () => undefined),
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  vi.useRealTimers();
  resetEngineOnlineForTests();
  resetActivityForTests();
  localStorage.clear();
  sessionStorage.clear();
});

const status = () => screen.getByRole("status");

describe("a full disk", () => {
  it("says so in the error look instead of Ready, until a write is known to have succeeded", async () => {
    let library = 1;
    (bridge.listJobs as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      jobs: [],
      active_count: 0,
      revisions: { library, waveforms: 1 },
    }));
    renderStrip();
    expect(await screen.findByText("Ready")).toBeInTheDocument();
    act(() => noteDiskFull());
    const words = screen.getByText("Your disk is full. CuePoint can't save changes until there's space.");
    expect(words).toHaveClass("cp-status__engine--error");
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
    // A change the page only announces is not proof of room.
    act(() => {
      window.dispatchEvent(new Event("cuepoint:library-changed"));
    });
    expect(screen.getByText("Your disk is full. CuePoint can't save changes until there's space.")).toBeInTheDocument();
    // The engine's counter moving is.
    library = 2;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(await screen.findByText("Ready")).toBeInTheDocument();
  });
});

describe("a restore that waits for work", () => {
  it("is said in the strip with a Cancel, wherever the person is", async () => {
    renderStrip();
    await screen.findByText("Ready");
    act(() => waitThenRestore({ name: "a.db", createdAt: "", reason: "launch", appVersion: null, bytes: 1 }, "An import"));
    expect(screen.getByText("Restores your library when the import finishes")).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Cancel restore" }).click());
    expect(screen.queryByText("Restores your library when the import finishes")).not.toBeInTheDocument();
  });
});

describe("the notes", () => {
  it("says a note in the place of Ready, quietly", async () => {
    renderStrip();
    await screen.findByText("Ready");
    act(() => showStripNotice("An export was interrupted. Nothing was written."));
    const note = screen.getByText("An export was interrupted. Nothing was written.");
    expect(note).toHaveClass("cp-status__engine--ok");
    expect(status()).toContainElement(note);
  });

  it("tells once, after an unclean exit, when the check of the library passed", async () => {
    let check = "running";
    Object.assign(bridge, {
      library: {
        getUncleanExit: vi.fn().mockResolvedValue(true),
        getState: vi.fn(async () => ({ state: "ok", integrityCheck: { state: check, finishedAt: null } })),
      },
    });
    renderStrip();
    await screen.findByText("Ready");
    expect(screen.queryByText(/didn't close properly/)).not.toBeInTheDocument();
    check = "ok";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    expect(
      await screen.findByText("CuePoint didn't close properly last time. Your library was checked and is fine."),
    ).toBeInTheDocument();
  });

  it("says nothing after a clean exit", async () => {
    Object.assign(bridge, {
      library: {
        getUncleanExit: vi.fn().mockResolvedValue(false),
        getState: vi.fn(async () => ({ state: "ok", integrityCheck: { state: "ok", finishedAt: null } })),
      },
    });
    renderStrip();
    await screen.findByText("Ready");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.queryByText(/didn't close properly/)).not.toBeInTheDocument();
  });

  it("says the window was reopened, from main, once", async () => {
    Object.assign(bridge, {
      windowRecovery: {
        take: vi.fn().mockResolvedValue("CuePoint's window stopped and was reopened."),
        onReopened: () => () => undefined,
      },
    });
    renderStrip();
    expect(await screen.findByText("CuePoint's window stopped and was reopened.")).toBeInTheDocument();
  });

  it("says an export was interrupted when the jobs marked so at start include one", async () => {
    const recent = new Date().toISOString();
    bridge.listJobs = vi.fn().mockResolvedValue({
      jobs: [
        { id: "j1", type: "clean_match", state: "failed", created_at: recent, updated_at: recent, error: { code: "JOB_INTERRUPTED" } },
        { id: "j2", type: "rekordbox_export", state: "failed", created_at: recent, updated_at: recent, error: { code: "JOB_INTERRUPTED" } },
      ],
      active_count: 0,
    });
    renderStrip();
    expect(await screen.findByText("An export was interrupted. Nothing was written.")).toBeInTheDocument();
  });

  it("does not say it for an old interruption, or a different kind of work", async () => {
    const old = new Date(Date.now() - 3 * 3600_000).toISOString();
    const recent = new Date().toISOString();
    bridge.listJobs = vi.fn().mockResolvedValue({
      jobs: [
        { id: "j1", type: "rekordbox_export", state: "failed", created_at: old, updated_at: old, error: { code: "JOB_INTERRUPTED" } },
        { id: "j2", type: "tag_write", state: "failed", created_at: recent, updated_at: recent, error: { code: "JOB_INTERRUPTED" } },
      ],
      active_count: 0,
    });
    renderStrip();
    await screen.findByText("Ready");
    await waitFor(() => expect(bridge.listJobs).toHaveBeenCalledWith({ state: "all", limit: 50 }));
    expect(screen.queryByText(/export was interrupted/)).not.toBeInTheDocument();
  });
});
