/**
 * The recovery screen (HARDEN-03, DEC-182, DEC-305): each state's words and buttons, and what the
 * buttons call. The gate shows it instead of the app, and only for the four states that need it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { LibraryStatus } from "../../api/cuepointBridge.types";
import { LibraryGate } from "./LibraryGate";
import { LibraryRecovery, libraryFileFrom, megabytesNeeded } from "./LibraryRecovery";

const TODAY_941 = new Date(2026, 9, 29, 9, 41).toISOString();

function status(overrides: Partial<LibraryStatus> = {}): LibraryStatus {
  return {
    state: "damaged",
    appVersion: "1.0.0",
    libraryVersion: null,
    schemaVersion: null,
    headVersion: 31,
    newestGoodBackup: { name: "good.db", createdAt: TODAY_941, reason: "launch" },
    preUpgradeBackup: null,
    requiredFreeBytes: null,
    failedMigration: null,
    uncleanExit: false,
    computedAt: "2026-10-29T09:00:00Z",
    integrityCheck: { state: "idle", finishedAt: null },
    launchBackupSkipped: null,
    ...overrides,
  };
}

let restore: ReturnType<typeof vi.fn>;
let recheck: ReturnType<typeof vi.fn>;
let getState: ReturnType<typeof vi.fn>;
let openReleasePage: ReturnType<typeof vi.fn>;
let showItemInFolder: ReturnType<typeof vi.fn>;
let showInFolder: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date(2026, 9, 29, 14, 0) });
  restore = vi.fn(async () => ({ ok: true, engineRunning: true }));
  recheck = vi.fn(async () => undefined);
  getState = vi.fn(async () => status({ state: "ok", computedAt: "2026-10-29T10:00:00Z" }));
  openReleasePage = vi.fn(async () => true);
  showItemInFolder = vi.fn(async () => undefined);
  showInFolder = vi.fn(async () => true);
  (window as unknown as { cuepoint: unknown }).cuepoint = {
    backups: {
      restore,
      showInFolder,
      list: vi.fn(async () => ({
        backups: [
          { name: "b1.db", createdAt: TODAY_941, reason: "launch", appVersion: "1.0.0", bytes: 4 * 1024 * 1024 },
          { name: "b2.db", createdAt: new Date(2026, 9, 27, 22, 10).toISOString(), reason: "pre-upgrade", appVersion: "0.9.0", bytes: 4 * 1024 * 1024, toVersion: "1.0.0" },
        ],
        folder: "/home/x/.cuepoint/backups",
      })),
      onRestoreEvent: () => () => undefined,
    },
    library: { getState, recheck, getUncleanExit: vi.fn(), onStateChanged: () => () => undefined },
    updates: { openReleasePage },
    showItemInFolder,
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const names = () => screen.getAllByRole("button").map((b) => b.textContent);

function show(overrides: Partial<LibraryStatus>, onState = vi.fn()) {
  render(<LibraryRecovery status={status(overrides)} onState={onState} settlePollMs={10} />);
  return onState;
}

describe("Damaged", () => {
  it("says what happened and names the newest good backup", () => {
    show({});
    expect(screen.getByRole("heading", { level: 1, name: "CuePoint couldn't read your library" })).toBeInTheDocument();
    expect(
      screen.getByText("Something damaged the file your library is kept in. Your latest good backup is from today, 9:41 AM."),
    ).toBeInTheDocument();
  });

  it("offers the four ways on, the main one first", () => {
    show({});
    expect(names()).toEqual(["Restore this backup", "Choose another backup", "Show the library file", "Report this problem"]);
  });

  it("Restore this backup restores the newest good backup, then asks for the new state", async () => {
    const onState = show({});
    await user().click(screen.getByRole("button", { name: "Restore this backup" }));
    expect(restore).toHaveBeenCalledWith("good.db");
    await waitFor(() => expect(onState).toHaveBeenCalledWith(expect.objectContaining({ state: "ok" })));
  });

  it("says why a restore did not happen", async () => {
    restore.mockResolvedValue({ ok: false, errorCode: "RESTORE_FAILED", message: "Your library was not changed." });
    show({});
    await user().click(screen.getByRole("button", { name: "Restore this backup" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your library was not changed.");
  });

  it("Choose another backup lists the backups, each with Restore, and Back returns", async () => {
    show({});
    await user().click(screen.getByRole("button", { name: "Choose another backup" }));
    expect(
      await screen.findByText("Choose the backup to restore. Your library file as it is now is set aside first."),
    ).toBeInTheDocument();
    expect(screen.getByText("Before updating to 1.0.0")).toBeInTheDocument();
    await user().click(screen.getByRole("button", { name: "Restore the backup from Oct 27, 10:10 PM" }));
    expect(restore).toHaveBeenCalledWith("b2.db");
    await waitFor(() => expect(screen.getByRole("button", { name: "Back" })).toBeEnabled());
    await user().click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Restore this backup" })).toBeInTheDocument();
  });

  it("Show the library file shows the file beside the backups folder", async () => {
    show({});
    await user().click(screen.getByRole("button", { name: "Show the library file" }));
    await waitFor(() => expect(showItemInFolder).toHaveBeenCalledWith("/home/x/.cuepoint/cuepoint.db"));
  });

  it("Report this problem opens the report dialog", async () => {
    show({});
    await user().click(screen.getByRole("button", { name: "Report this problem" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("offers no restore of a backup when none is good", () => {
    show({ newestGoodBackup: null });
    expect(screen.queryByRole("button", { name: "Restore this backup" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose another backup" })).toBeInTheDocument();
  });
});

describe("Too new", () => {
  it("names both versions and offers the latest CuePoint or a backup", async () => {
    show({ state: "too_new", libraryVersion: "1.2.0" });
    expect(screen.getByRole("heading", { level: 1, name: "This library is from a newer CuePoint" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "It was last opened by CuePoint 1.2.0, and this is 1.0.0. Install the newer version, or restore a backup from before it.",
      ),
    ).toBeInTheDocument();
    expect(names()).toEqual(["Get the latest CuePoint", "Choose a backup"]);
    await user().click(screen.getByRole("button", { name: "Get the latest CuePoint" }));
    expect(openReleasePage).toHaveBeenCalledWith("update");
  });

  it("opens the running version's page when there is no newer one to name", async () => {
    openReleasePage.mockResolvedValueOnce(false);
    show({ state: "too_new" });
    await user().click(screen.getByRole("button", { name: "Get the latest CuePoint" }));
    await waitFor(() => expect(openReleasePage).toHaveBeenLastCalledWith("current"));
  });
});

describe("Upgrade failed", () => {
  const failed = { state: "upgrade_failed" as const, preUpgradeBackup: { name: "pre.db", createdAt: TODAY_941, reason: "pre-upgrade" } };

  it("says nothing was lost and names the copy", () => {
    show(failed);
    expect(screen.getByRole("heading", { level: 1, name: "CuePoint couldn't finish updating your library" })).toBeInTheDocument();
    expect(screen.getByText("Nothing was lost: a copy from just before the update is kept (today, 9:41 AM).")).toBeInTheDocument();
    expect(names()).toEqual(["Try again", "Restore that copy", "Report this problem"]);
  });

  it("Try again asks for another check and hands up the new state", async () => {
    const onState = show(failed);
    await user().click(screen.getByRole("button", { name: "Try again" }));
    expect(recheck).toHaveBeenCalled();
    await waitFor(() => expect(onState).toHaveBeenCalledWith(expect.objectContaining({ state: "ok" })));
  });

  it("Restore that copy restores the copy from before the update", async () => {
    show(failed);
    await user().click(screen.getByRole("button", { name: "Restore that copy" }));
    expect(restore).toHaveBeenCalledWith("pre.db");
  });
});

describe("Needs space", () => {
  it("says about how much, rounded to 100 MB, and offers Try again", () => {
    show({ state: "needs_space", requiredFreeBytes: 262 * 1024 * 1024 });
    expect(screen.getByRole("heading", { level: 1, name: "CuePoint needs more space to update your library" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "About 300 MB must be free to keep a copy of your library before the update. Free some space, then try again.",
      ),
    ).toBeInTheDocument();
    expect(names()).toEqual(["Try again"]);
  });

  it("rounds up to the next 100 MB, and never says less than 100", () => {
    expect(megabytesNeeded(262 * 1024 * 1024)).toBe(300);
    expect(megabytesNeeded(300 * 1024 * 1024)).toBe(300);
    expect(megabytesNeeded(1)).toBe(100);
    expect(megabytesNeeded(null)).toBe(100);
  });
});

describe("the library file", () => {
  it("is beside the backups folder", () => {
    expect(libraryFileFrom("/home/x/.cuepoint/backups")).toBe("/home/x/.cuepoint/cuepoint.db");
    expect(libraryFileFrom("C:\\Users\\x\\.cuepoint\\backups\\")).toBe("C:\\Users\\x\\.cuepoint\\cuepoint.db");
    expect(libraryFileFrom("/somewhere/else")).toBeNull();
    expect(libraryFileFrom(null)).toBeNull();
  });
});

describe("the gate", () => {
  const app = <p>The app</p>;

  function gate() {
    return render(<LibraryGate>{app}</LibraryGate>);
  }

  it("shows the app while the library is ok", async () => {
    getState.mockResolvedValue(status({ state: "ok" }));
    gate();
    await waitFor(() => expect(getState).toHaveBeenCalled());
    expect(screen.getByText("The app")).toBeInTheDocument();
  });

  it("shows the app before there is an answer, and while the library is upgrading", async () => {
    getState.mockRejectedValue(new Error("Engine not running"));
    gate();
    expect(screen.getByText("The app")).toBeInTheDocument();
    getState.mockResolvedValue(status({ state: "upgrading" }));
    await vi.advanceTimersByTimeAsync(1600);
    expect(screen.getByText("The app")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it.each(["damaged", "too_new", "upgrade_failed", "needs_space"] as const)("takes the whole window for %s", async (state) => {
    getState.mockResolvedValue(status({ state }));
    gate();
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("The app")).not.toBeInTheDocument();
  });

  it("shows the app again when the library is ok", async () => {
    let changed: () => void = () => undefined;
    (window.cuepoint as unknown as { library: { onStateChanged: (l: () => void) => () => void } }).library.onStateChanged = (listener) => {
      changed = listener;
      return () => undefined;
    };
    getState.mockResolvedValue(status({ state: "damaged" }));
    gate();
    await screen.findByRole("heading", { level: 1 });
    getState.mockResolvedValue(status({ state: "ok" }));
    changed();
    expect(await screen.findByText("The app")).toBeInTheDocument();
  });
});
