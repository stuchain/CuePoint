/**
 * Settings › Backups (HARDEN-01, DEC-305): the list with its reasons in words, Back up now (greyed
 * while it runs), Restore asking first, and the question that names running work and offers
 * "Stop it and restore now", Cancel and "Restore when done".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { BackupEntry, BackupRestoreEvent, BackupRestoreResult } from "../api/cuepointBridge.types";
import { BackupsSection } from "./BackupsSection";
import { expectNoAxeViolations } from "../test/axe";

const NOW = new Date(2026, 9, 29, 14, 0, 0);
const at = (month: number, day: number, hour: number, minute: number) =>
  new Date(2026, month, day, hour, minute).toISOString();

const ENTRIES: BackupEntry[] = [
  { name: "a.db", createdAt: at(9, 29, 13, 2), reason: "manual", appVersion: "1.0.0", bytes: 4.2 * 1024 * 1024 },
  { name: "b.db", createdAt: at(9, 29, 9, 41), reason: "launch", appVersion: "1.0.0", bytes: 4.2 * 1024 * 1024 },
  { name: "c.db", createdAt: at(9, 27, 22, 10), reason: "pre-upgrade", appVersion: "0.9.0", bytes: 4.1 * 1024 * 1024, toVersion: "1.0.0" },
  { name: "d.db", createdAt: at(9, 23, 11, 5), reason: "pre-restore", appVersion: "1.0.0", bytes: 3.9 * 1024 * 1024 },
];

let list: ReturnType<typeof vi.fn>;
let create: ReturnType<typeof vi.fn>;
let restore: ReturnType<typeof vi.fn>;
let showInFolder: ReturnType<typeof vi.fn>;
let listJobs: ReturnType<typeof vi.fn>;
let restoreEvent: ((event: BackupRestoreEvent) => void) | null;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  restoreEvent = null;
  list = vi.fn(async () => ({ backups: ENTRIES, folder: "/home/x/.cuepoint/backups" }));
  create = vi.fn(async () => ENTRIES[0]);
  restore = vi.fn(async (): Promise<BackupRestoreResult> => ({ ok: true, engineRunning: true }));
  showInFolder = vi.fn(async () => true);
  listJobs = vi.fn(async () => ({ jobs: [], active_count: 0 }));
  (window as unknown as { cuepoint: unknown }).cuepoint = {
    backups: {
      list,
      create,
      restore,
      showInFolder,
      onRestoreEvent: (listener: (event: BackupRestoreEvent) => void) => {
        restoreEvent = listener;
        return () => {
          restoreEvent = null;
        };
      },
    },
    listJobs,
  };
});

afterEach(() => {
  vi.useRealTimers();
});

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

async function shown() {
  render(<BackupsSection />);
  await screen.findByText("You made this");
}

describe("the list", () => {
  it("names the section and gives the note", async () => {
    await shown();
    expect(screen.getByRole("heading", { name: "Backups" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your library is backed up each time you open CuePoint after a change. The last 5 are kept, and the last 3 from before an update.",
      ),
    ).toBeInTheDocument();
  });

  it("says when each was made and why, in words, with its size", async () => {
    await shown();
    const rows = within(screen.getByRole("list", { name: "Backups" })).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Today, 1:02 PM");
    expect(rows[0]).toHaveTextContent("You made this");
    expect(rows[0]).toHaveTextContent("4.2 MB");
    expect(rows[1]).toHaveTextContent("Today, 9:41 AM");
    expect(rows[1]).toHaveTextContent("When you opened CuePoint");
    expect(rows[2]).toHaveTextContent("Oct 27, 10:10 PM");
    expect(rows[2]).toHaveTextContent("Before updating to 1.0.0");
    expect(rows[3]).toHaveTextContent("Before restoring");
  });

  it("has Restore on each row and no Delete", async () => {
    await shown();
    expect(screen.getAllByRole("button", { name: /^Restore the backup from/ })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("shows the backups folder", async () => {
    await shown();
    await user().click(screen.getByRole("button", { name: "Show in folder" }));
    expect(showInFolder).toHaveBeenCalledWith();
  });

  it("says so when there is none yet", async () => {
    list.mockResolvedValue({ backups: [], folder: null });
    render(<BackupsSection />);
    expect(await screen.findByText("No backups yet")).toBeInTheDocument();
  });
});

describe("Back up now", () => {
  it("makes a backup and reads the list again", async () => {
    await shown();
    await user().click(screen.getByRole("button", { name: "Back up now" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Backed up just now")).toBeInTheDocument();
  });

  it("is greyed while it runs", async () => {
    let finish: (entry: BackupEntry) => void = () => undefined;
    create.mockImplementation(() => new Promise<BackupEntry>((resolve) => (finish = resolve)));
    await shown();
    await user().click(screen.getByRole("button", { name: "Back up now" }));
    const button = screen.getByRole("button", { name: "Back up now" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await act(async () => finish(ENTRIES[0]!));
    await waitFor(() => expect(screen.getByRole("button", { name: "Back up now" })).toBeEnabled());
  });

  it("says why when it fails", async () => {
    create.mockRejectedValue(new Error("There is no room for a backup."));
    await shown();
    await user().click(screen.getByRole("button", { name: "Back up now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("There is no room for a backup.");
  });
});

describe("Restore", () => {
  it("asks first, naming the moment and why, and restores on Restore", async () => {
    await shown();
    await user().click(screen.getByRole("button", { name: /^Restore the backup from Oct 27, 10:10 PM/ }));
    const dialog = screen.getByRole("dialog", { name: "Restore this backup?" });
    expect(dialog).toHaveTextContent(
      "Your library goes back to how it was on Tuesday, October 27, 10:10 PM, before updating to 1.0.0.",
    );
    expect(dialog).toHaveTextContent("Your library as it is now is kept as a backup first, so you can come back to it.");
    expect(restore).not.toHaveBeenCalled();
    await user().click(within(dialog).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith("c.db", undefined));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Cancel restores nothing", async () => {
    await shown();
    await user().click(screen.getAllByRole("button", { name: /^Restore the backup from/ })[0]!);
    await user().click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(restore).not.toHaveBeenCalled();
  });

  it("reads the library again when main says it has restored", async () => {
    const reads = vi.fn();
    window.addEventListener("cuepoint:library-changed", reads);
    await shown();
    act(() => restoreEvent?.({ phase: "restoring" }));
    expect(await screen.findByText("Restoring your library…")).toBeInTheDocument();
    act(() => restoreEvent?.({ phase: "restored", safetyBackup: "e.db" }));
    expect(reads).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("Restoring your library…")).not.toBeInTheDocument());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    window.removeEventListener("cuepoint:library-changed", reads);
  });

  it("says a restore that failed, and that nothing changed", async () => {
    await shown();
    act(() => restoreEvent?.({ phase: "failed", errorCode: "RESTORE_FAILED", message: "Your library was not changed." }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your library was not changed.");
  });
});

describe("Restore while work runs", () => {
  const running: BackupRestoreResult = {
    ok: false,
    errorCode: "WORK_RUNNING",
    message: "Work is running.",
    running: [{ id: "job-1", type: "library_import", state: "running" }],
  };

  async function openBusy() {
    restore.mockResolvedValueOnce(running);
    listJobs.mockResolvedValue({
      jobs: [{ id: "job-1", type: "library_import", state: "running", progress: { completed_tracks: 312, total_tracks: 2400 } }],
      active_count: 1,
    });
    await shown();
    await user().click(screen.getByRole("button", { name: /^Restore the backup from Oct 27, 10:10 PM/ }));
    await user().click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore" }));
    return await screen.findByText("An import is running");
  }

  it("names the work and offers the three choices, extra at the left, the main one at the right", async () => {
    await openBusy();
    const dialog = screen.getByRole("dialog", { name: "Restore this backup?" });
    expect(dialog).toHaveTextContent("(312 of 2,400 tracks)");
    expect(dialog).toHaveTextContent("Restore when it's done, or stop it and restore now.");
    const labels = within(dialog)
      .getAllByRole("button")
      .map((button) => button.textContent)
      .filter((text) => text !== "");
    expect(labels.slice(-3)).toEqual(["Stop it and restore now", "Cancel", "Restore when done"]);
  });

  it("Stop it and restore now restores with the work cancelled", async () => {
    await openBusy();
    await user().click(screen.getByRole("button", { name: "Stop it and restore now" }));
    await waitFor(() => expect(restore).toHaveBeenLastCalledWith("c.db", { cancelRunning: true }));
  });

  it("Restore when done waits for the work to end, then restores", async () => {
    await openBusy();
    await user().click(screen.getByRole("button", { name: "Restore when done" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Restores your library when the import finishes")).toBeInTheDocument();
    expect(restore).toHaveBeenCalledTimes(1);
    listJobs.mockResolvedValue({ jobs: [], active_count: 0 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(2));
    expect(restore).toHaveBeenLastCalledWith("c.db", undefined);
  });

  it("keeps waiting, and restores, while Settings is not the page shown", async () => {
    const { unmount } = await (async () => {
      await openBusy();
      await user().click(screen.getByRole("button", { name: "Restore when done" }));
      return { unmount: () => cleanup() };
    })();
    unmount();
    listJobs.mockResolvedValue({ jobs: [], active_count: 0 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(2));
    expect(restore).toHaveBeenLastCalledWith("c.db", undefined);
  });

  it("reads the library again once, however many ways it hears the restore ended", async () => {
    const reads = vi.fn();
    window.addEventListener("cuepoint:library-changed", reads);
    await shown();
    act(() => restoreEvent?.({ phase: "restoring" }));
    act(() => restoreEvent?.({ phase: "restored" }));
    act(() => restoreEvent?.({ phase: "restored" }));
    expect(reads).toHaveBeenCalledTimes(1);
    window.removeEventListener("cuepoint:library-changed", reads);
  });

  it("Cancel restore stops waiting", async () => {
    await openBusy();
    await user().click(screen.getByRole("button", { name: "Restore when done" }));
    await user().click(screen.getByRole("button", { name: "Cancel restore" }));
    listJobs.mockResolvedValue({ jobs: [], active_count: 0 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("Back up now is greyed while a restore waits", async () => {
    await openBusy();
    await user().click(screen.getByRole("button", { name: "Restore when done" }));
    expect(screen.getByRole("button", { name: "Back up now" })).toBeDisabled();
  });
});

describe("Settings › Backups accessibility (HARDEN-08)", () => {
  it("has no WCAG 2.2 A or AA violations in the list", async () => {
    await shown();
    await expectNoAxeViolations();
  });

  it("has none with the restore question open", async () => {
    await shown();
    await user().click(screen.getByRole("button", { name: /^Restore the backup from Oct 27, 10:10 PM/ }));
    await screen.findByRole("dialog", { name: "Restore this backup?" });
    await expectNoAxeViolations();
  });

  it("has none with the question that names running work", async () => {
    restore.mockResolvedValueOnce({
      ok: false,
      errorCode: "WORK_RUNNING",
      message: "Work is running.",
      running: [{ id: "job-1", type: "library_import", state: "running" }],
    });
    listJobs.mockResolvedValue({
      jobs: [{ id: "job-1", type: "library_import", state: "running", progress: { completed_tracks: 312, total_tracks: 2400 } }],
      active_count: 1,
    });
    await shown();
    await user().click(screen.getByRole("button", { name: /^Restore the backup from Oct 27, 10:10 PM/ }));
    await user().click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore" }));
    await screen.findByText("An import is running");
    await expectNoAxeViolations();
  });

  it("has none while a restore failed", async () => {
    await shown();
    act(() => restoreEvent?.({ phase: "failed", errorCode: "RESTORE_FAILED", message: "Your library was not changed." }));
    await screen.findByRole("alert");
    await expectNoAxeViolations();
  });
});
