/**
 * Settings › About & updates (DIST-07): the build, the state of updates in words, and the buttons.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { EngineJobSummary, UpdateState } from "../api/cuepointBridge.types";
import { installUpdates, updateState, type FakeUpdates } from "../test/updatesBridge";
import { resetRestart } from "../components/updates/restartStore";
import { UpdateStatusItem } from "../components/updates/UpdateStatusItem";
import { AboutUpdatesSection } from "./AboutUpdatesSection";

let fake: FakeUpdates;
let jobs: EngineJobSummary[];

function setup(state: Partial<UpdateState> = {}, extra: Record<string, unknown> = {}, notes?: unknown) {
  fake = installUpdates(updateState(state), {
    notes: notes as never,
    extra: {
      buildInfo: vi.fn(async () => ({
        version: "1.0.0-test.1",
        release: "cuepoint@1.0.0-test.1",
        dist: "abc1234",
        environment: "production",
      })),
      listJobs: vi.fn(async () => ({ jobs, active_count: jobs.length })),
      ...extra,
    },
  });
  return render(<AboutUpdatesSection />);
}

beforeEach(() => {
  jobs = [];
});

afterEach(() => {
  resetRestart();
  vi.useRealTimers();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("the build", () => {
  it("shows the build and calls a -test.N version a test version", async () => {
    setup();
    expect(await screen.findByText(/Build abc1234/)).toBeInTheDocument();
    expect(screen.getByText(/test version/)).toBeInTheDocument();
  });

  it("does not call a final version a test version", async () => {
    setup(
      { currentVersion: "1.0.0" },
      { buildInfo: vi.fn(async () => ({ version: "1.0.0", release: "cuepoint@1.0.0", dist: "abc1234", environment: "production" })) },
    );
    await screen.findByText(/Build abc1234/);
    expect(screen.queryByText(/test version/)).toBeNull();
  });

  it("says when no build was recorded", async () => {
    setup({}, { buildInfo: vi.fn(async () => ({ version: "1.0.0-test.1", release: "r", dist: null, environment: "production" })) });
    expect(await screen.findByText(/Build not recorded/)).toBeInTheDocument();
  });
});

describe("last checked", () => {
  it("says never when it has not", async () => {
    setup({ status: "up-to-date" });
    expect(await screen.findByText("Never checked")).toBeInTheDocument();
  });

  it("writes the time the American way", async () => {
    setup({ status: "up-to-date", lastCheckedAt: new Date(2026, 8, 2, 15, 5).toISOString() });
    expect(await screen.findByText("Last checked 3:05 PM")).toBeInTheDocument();
  });

  it("gives the local time", async () => {
    setup({ status: "up-to-date", lastCheckedAt: new Date(2026, 8, 2, 10, 42).toISOString() });
    expect(await screen.findByText(/Last checked 10:42/)).toBeInTheDocument();
  });
});

describe("the state in words", () => {
  it.each([
    [{ status: "up-to-date" }, "You're up to date"],
    [{ status: "checking" }, "Checking for updates…"],
    [{ status: "downloading", version: "1.0.0-test.2", progress: 40 }, "Downloading 1.0.0-test.2…"],
    [{ status: "idle" }, "Not checked yet"],
    [{ status: "failed", error: "could-not-check" }, "Couldn't check for updates. You may be offline."],
    [{ status: "failed", error: "download-failed" }, "The update didn't download. CuePoint will try again later."],
    [{ status: "failed", error: "install-failed" }, "The update didn't install. CuePoint will try again later."],
    [
      { status: "manual", manualReason: "linux", version: "1.0.1" },
      "Updates on Linux are installed by hand.",
    ],
    [
      { status: "manual", manualReason: "cannot-replace", version: "1.0.1" },
      "CuePoint can't replace itself from where it is installed. Download the new version.",
    ],
  ] as [Partial<UpdateState>, string][])("%j reads %s", async (state, words) => {
    setup(state);
    expect(await screen.findByText(words)).toBeInTheDocument();
  });

  it("keeps the percentage out of the live words", async () => {
    setup({ status: "downloading", version: "1.0.0-test.2", progress: 40 });
    const words = await screen.findByText("Downloading 1.0.0-test.2…");
    expect(words.closest("[aria-live='polite']")).not.toBeNull();
    expect(screen.getByText("40%").closest("[aria-live]")).toBeNull();
  });

  it("says updates are checked in the installed app only in a run from source", async () => {
    setup(
      { status: "idle" },
      { buildInfo: vi.fn(async () => ({ version: "1.0.0-test.1", release: "r", dist: "abc1234", environment: "development" })) },
    );
    expect(await screen.findByText("Updates are checked in the installed app.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeDisabled();
  });

  it("lets an installed app that has not checked yet check, through main", async () => {
    setup({ status: "idle" });
    await screen.findByText("Not checked yet");
    const button = screen.getByRole("button", { name: "Check for updates" });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(fake.bridge.check).toHaveBeenCalledTimes(1);
  });

  it("calls a test version a test version from the state when there is no build info", async () => {
    setup({ status: "up-to-date" }, { buildInfo: undefined });
    expect(await screen.findByText("test version")).toBeInTheDocument();
  });

  it("uses none of the engine's words", async () => {
    const { container } = setup({ status: "failed", error: "download-failed" });
    await screen.findByText(/didn't download/);
    expect(container.textContent).not.toMatch(/\b(engine|jobs?|channel|feed|pre-?release)\b/i);
  });

  it("follows a push", async () => {
    setup({ status: "up-to-date" });
    await screen.findByText("You're up to date");
    act(() => fake.push(updateState({ status: "checking" })));
    expect(screen.getByText("Checking for updates…")).toBeInTheDocument();
  });

  it("announces politely", async () => {
    setup({ status: "up-to-date" });
    const words = await screen.findByText("You're up to date");
    expect(words.closest("[aria-live='polite']")).not.toBeNull();
  });
});

describe("Check for updates", () => {
  it("asks main to check", async () => {
    setup({ status: "up-to-date" });
    await userEvent.click(await screen.findByRole("button", { name: "Check for updates" }));
    expect(fake.bridge.check).toHaveBeenCalledTimes(1);
  });

  it.each(["checking", "downloading"] as const)("is disabled while %s", async (status) => {
    setup({ status, version: "1.0.0-test.2", progress: 5 });
    await screen.findByText(/Build abc1234/);
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeDisabled();
  });
});

describe("an update that is ready", () => {
  const READY = { status: "ready" as const, version: "1.0.0-test.2", progress: 100 };

  it("says so and restarts through the bridge", async () => {
    setup(READY);
    expect(await screen.findByText("Update ready")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restart now" }));
    await waitFor(() => expect(fake.bridge.restart).toHaveBeenCalledTimes(1));
  });

  it("puts focus on Cancel when it asks", async () => {
    jobs = [{ id: "j", type: "library_import", state: "running", created_at: "x", updated_at: "x" }];
    setup(READY);
    await userEvent.click(await screen.findByRole("button", { name: "Restart now" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
  });

  it("agrees with the strip: waiting started here shows there, and main is asked once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    jobs = [{ id: "j", type: "library_import", state: "running", created_at: "x", updated_at: "x" }];
    setup(READY);
    render(<UpdateStatusItem />);
    await userEvent.click(await screen.findByRole("button", { name: "Restart now" }));
    await userEvent.click(await screen.findByRole("button", { name: "Restart when done" }));
    expect(await screen.findByRole("button", { name: "Restarts when importing finishes" })).toBeInTheDocument();
    expect(screen.getByText("Restarts when importing finishes", { selector: "span" })).toBeInTheDocument();
    jobs = [];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    expect(fake.bridge.restart).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting when Settings goes away and comes back", async () => {
    jobs = [{ id: "j", type: "library_import", state: "running", created_at: "x", updated_at: "x" }];
    const { unmount } = setup(READY);
    await userEvent.click(await screen.findByRole("button", { name: "Restart now" }));
    await userEvent.click(await screen.findByRole("button", { name: "Restart when done" }));
    unmount();
    render(<AboutUpdatesSection />);
    expect(await screen.findByText("Restarts when importing finishes")).toBeInTheDocument();
  });

  it("asks first when work is running, and can wait for it", async () => {
    jobs = [
      {
        id: "j",
        type: "library_import",
        state: "running",
        created_at: "x",
        updated_at: "x",
        progress: { completed_tracks: 1, total_tracks: 5, percentage: 20 },
      },
    ];
    setup(READY);
    await userEvent.click(await screen.findByRole("button", { name: "Restart now" }));
    expect(await screen.findByText(/Importing is still running\./)).toBeInTheDocument();
    expect(fake.bridge.restart).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/is still running/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Restart now" }));
    await userEvent.click(await screen.findByRole("button", { name: "Restart when done" }));
    expect(await screen.findByText(/Restarts when importing finishes/)).toBeInTheDocument();
    expect(fake.bridge.restart).not.toHaveBeenCalled();
  });
});

describe("an update to fetch by hand", () => {
  it("says it is out and Download opens the release page", async () => {
    setup({ status: "manual", manualReason: "linux", version: "1.0.1" });
    expect(await screen.findByText("CuePoint 1.0.1 is out")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(fake.bridge.openReleasePage).toHaveBeenCalledTimes(1);
  });
});

describe("What's new", () => {
  it("opens the installed version's notes on demand and never dismisses them", async () => {
    setup(
      { status: "up-to-date" },
      {},
      { version: "1.0.0-test.1", notes: "- Something new", releaseUrl: null },
    );
    await userEvent.click(await screen.findByRole("button", { name: "What's new" }));
    const dialog = await screen.findByRole("dialog", { name: "What's new in CuePoint 1.0.0-test.1" });
    expect(dialog).toHaveTextContent("Something new");
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(fake.bridge.getNotes).toHaveBeenCalled();
    expect(fake.bridge.dismissWhatsNew).not.toHaveBeenCalled();
  });
});

describe("without the bridge", () => {
  it("still says something kind", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    render(<AboutUpdatesSection />);
    expect(await screen.findByText("Updates are checked in the installed app.")).toBeInTheDocument();
  });
});
