/**
 * Acting on an Activity entry (CLEAN-13).
 *
 * A batch's entry reverts it — after a second click — and a membership batch's
 * control is disabled with its reason. A tag write's entry reads its record,
 * says how many writes may not have finished, and restores after a second
 * click. Whatever changed is announced to the rest of the app.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ActivityEvent, ActivityFeed, TagWriteRecord } from "../../api/cuepointBridge.types";
import { LIBRARY_CHANGED_EVENT } from "../../api/libraryChanges";
import { ActivityPanel } from "./ActivityPanel";
import { MEMBERSHIP_REVERT_REASON } from "./activityActions";

function event(id: number, type: string, detail: Record<string, unknown>, summary = `event ${id}`): ActivityEvent {
  return { id, type, summary, detail, created_at: `2026-09-16T10:0${id}:00Z` };
}

function record(restorable: number, unconfirmed: number): TagWriteRecord {
  return {
    job_id: "w-1",
    track_id: null,
    writes: [],
    total: restorable,
    unconfirmed,
    restorable,
    restorable_unconfirmed: unconfirmed,
    limit: 1,
    offset: 0,
  };
}

type Mock = ReturnType<typeof vi.fn>;
let bridge: Record<string, Mock>;
let events: ActivityEvent[];

beforeEach(() => {
  events = [];
  bridge = {
    getRecentActivity: vi.fn(async (): Promise<ActivityFeed> => ({ events, total: events.length, limit: 50 })),
    revertBatch: vi.fn().mockResolvedValue({
      reverted: {
        batch_id: "n",
        operation: "revert_batch",
        target: "b-1",
        total: 3,
        changed: 3,
        unchanged: 0,
        failed: 0,
        cancelled: false,
        skipped: 0,
        revert_of: "b-1",
      },
    }),
    getTagWrites: vi.fn().mockResolvedValue(record(4, 0)),
    startTagRestore: vi.fn(async ({ job_id }: { job_id: string }) => ({
      job_id: `restore-${job_id}`,
      id: `restore-${job_id}`,
      state: "queued",
      writes: 4,
      unconfirmed: 0,
      restored_job_id: job_id,
      track_id: null,
    })),
    getJob: vi.fn(async (id: string) => ({ id, state: "succeeded" })),
    getJobResults: vi.fn(async (id: string) => ({
      id,
      state: "succeeded",
      result: {
        job_id: id,
        restored_job_id: "w-1",
        track_id: null,
        total: 4,
        completed: 4,
        restored: 4,
        already: 0,
        skipped: 0,
        failed: 0,
        files: 2,
        problems: [],
        problems_truncated: false,
        cancelled: false,
        duration_seconds: 1,
        summary_line: "",
      },
    })),
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

async function row(summary: string): Promise<HTMLElement> {
  return (await screen.findByText(summary)).closest("li") as HTMLElement;
}

describe("a batch's entry", () => {
  it("reverts the batch after asking, says what it did, and reads the feed again", async () => {
    events = [event(1, "library.batch", { batch_id: "b-1", operation: "set_rating", changed: 3 }, "Rated 3 tracks")];
    const announced = vi.fn();
    window.addEventListener(LIBRARY_CHANGED_EVENT, announced);
    render(<ActivityPanel open onClose={() => undefined} />);
    const entry = await row("Rated 3 tracks");

    await userEvent.click(within(entry).getByRole("button", { name: "Revert this batch" }));
    expect(bridge.revertBatch).not.toHaveBeenCalled();
    expect(within(entry).getByText("Revert every change this batch made?")).toBeInTheDocument();
    await userEvent.click(within(entry).getByRole("button", { name: "Revert" }));

    await waitFor(() => expect(bridge.revertBatch).toHaveBeenCalledWith({ batch_id: "b-1" }));
    expect(await within(entry).findByText("Reverted 3 changes.")).toBeInTheDocument();
    // Reverted once from here; its revert has an entry of its own to revert.
    expect(within(entry).queryByRole("button", { name: "Revert this batch" })).toBeNull();
    expect(announced).toHaveBeenCalled();
    await waitFor(() => expect(bridge.getRecentActivity).toHaveBeenCalledTimes(2));
    // Read again quietly: the entry and what it said stay on screen.
    expect(screen.getByText("Reverted 3 changes.")).toBeInTheDocument();
    window.removeEventListener(LIBRARY_CHANGED_EVENT, announced);
  });

  it("does nothing when the second click is Keep", async () => {
    events = [event(1, "library.batch", { batch_id: "b-1", operation: "add_tag", changed: 2 }, "Tagged 2")];
    render(<ActivityPanel open onClose={() => undefined} />);
    const entry = await row("Tagged 2");
    await userEvent.click(within(entry).getByRole("button", { name: "Revert this batch" }));
    await userEvent.click(within(entry).getByRole("button", { name: "Keep" }));
    expect(bridge.revertBatch).not.toHaveBeenCalled();
    expect(within(entry).getByRole("button", { name: "Revert this batch" })).toBeEnabled();
  });

  it("follows a revert that runs as a job", async () => {
    bridge.revertBatch.mockResolvedValue({ job_id: "j-1", id: "j-1", state: "queued" });
    bridge.getJobResults.mockResolvedValue({
      id: "j-1",
      state: "succeeded",
      result: {
        batch_id: "n",
        operation: "revert_batch",
        target: "b-1",
        total: 2000,
        changed: 1990,
        unchanged: 0,
        failed: 0,
        cancelled: false,
        skipped: 10,
        revert_of: "b-1",
      },
    });
    events = [event(1, "library.batch", { batch_id: "b-1", operation: "set_favorite", changed: 2000 }, "Big")];
    render(<ActivityPanel open onClose={() => undefined} />);
    const entry = await row("Big");
    await userEvent.click(within(entry).getByRole("button", { name: "Revert this batch" }));
    await userEvent.click(within(entry).getByRole("button", { name: "Revert" }));
    expect(
      await within(entry).findByText("Reverted 1,990 changes, 10 skipped because the value changed since."),
    ).toBeInTheDocument();
    expect(bridge.getJob).toHaveBeenCalledWith("j-1");
  });

  it("shows a refusal in the engine's words", async () => {
    bridge.revertBatch.mockRejectedValue(new Error("Batch b-1 changed nothing, so there is nothing to revert"));
    events = [event(1, "library.batch", { batch_id: "b-1", operation: "add_tag" }, "Odd")];
    render(<ActivityPanel open onClose={() => undefined} />);
    const entry = await row("Odd");
    await userEvent.click(within(entry).getByRole("button", { name: "Revert this batch" }));
    await userEvent.click(within(entry).getByRole("button", { name: "Revert" }));
    expect(await within(entry).findByText(/nothing to revert/)).toBeInTheDocument();
  });

  it("is disabled, with its reason, for Collection membership", async () => {
    events = [
      event(1, "library.batch", { batch_id: "b-2", operation: "add_to_collection", changed: 5 }, "Added 5"),
    ];
    render(<ActivityPanel open onClose={() => undefined} />);
    const entry = await row("Added 5");
    expect(within(entry).getByRole("button", { name: "Revert this batch" })).toBeDisabled();
    expect(within(entry).getByText(MEMBERSHIP_REVERT_REASON)).toBeInTheDocument();
  });

  it("offers nothing in a build without the route, or on an import", async () => {
    delete bridge.revertBatch;
    events = [
      event(1, "library.batch", { batch_id: "b-1", operation: "add_tag", changed: 1 }, "Tagged"),
      event(2, "library.imported", { count: 3 }, "Imported"),
    ];
    render(<ActivityPanel open onClose={() => undefined} />);
    await row("Tagged");
    expect(screen.queryByRole("button", { name: /Revert/ })).toBeNull();
  });
});

describe("a tag write's entry", () => {
  it("says what can be restored, and restores after asking", async () => {
    events = [event(1, "clean.tags.written", { job_id: "w-1" }, "Wrote tags to 2 files")];
    render(<ActivityPanel open onClose={() => undefined} />);
    const entry = await row("Wrote tags to 2 files");
    expect(await within(entry).findByText("4 values written to files can be restored.")).toBeInTheDocument();
    expect(bridge.getTagWrites).toHaveBeenCalledWith({ jobId: "w-1", limit: 1 });

    await userEvent.click(within(entry).getByRole("button", { name: "Restore" }));
    expect(bridge.startTagRestore).not.toHaveBeenCalled();
    await userEvent.click(within(entry).getByRole("button", { name: "Restore" }));

    await waitFor(() => expect(bridge.startTagRestore).toHaveBeenCalledWith({ job_id: "w-1" }));
    expect(await within(entry).findByText("Restored 2 files.")).toBeInTheDocument();
    expect(within(entry).getByText("Everything written here has been restored.")).toBeInTheDocument();
  });

  it("shows unconfirmed writes as unfinished, never as written", async () => {
    bridge.getTagWrites.mockResolvedValue(record(3, 3));
    events = [
      event(1, "clean.tags.interrupted", { job_id: "w-1", write_job_ids: ["w-1"] }, "Writing tags stopped"),
    ];
    render(<ActivityPanel open onClose={() => undefined} />);
    const entry = await row("Writing tags stopped");
    const note = await within(entry).findByText(/may not have finished/);
    expect(note).toHaveTextContent("3 writes may not have finished.");
    expect(note.textContent).not.toMatch(/were written/);
    expect(entry.querySelector(".cp-activity__offer--unfinished")).not.toBeNull();
    expect(within(entry).getByRole("button", { name: "Restore" })).toBeEnabled();
  });

  it("restores every write a stopped restore was undoing, one after another", async () => {
    events = [
      event(
        1,
        "clean.tags.interrupted",
        { job_id: "r-9", job_type: "tag_restore", write_job_ids: ["w-1", "w-2"] },
        "Restoring tags stopped",
      ),
    ];
    render(<ActivityPanel open onClose={() => undefined} />);
    const entry = await row("Restoring tags stopped");
    await within(entry).findByText(/can be restored/);
    await userEvent.click(within(entry).getByRole("button", { name: "Restore" }));
    await userEvent.click(within(entry).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(bridge.startTagRestore).toHaveBeenCalledTimes(2));
    expect(bridge.startTagRestore.mock.calls.map((call) => call[0])).toEqual([
      { job_id: "w-1" },
      { job_id: "w-2" },
    ]);
    expect(await within(entry).findByText("Restored 4 files.")).toBeInTheDocument();
  });

  it("offers no Restore once everything is back", async () => {
    bridge.getTagWrites.mockResolvedValue(record(0, 0));
    events = [event(1, "clean.tags.written", { job_id: "w-1" }, "Wrote tags")];
    render(<ActivityPanel open onClose={() => undefined} />);
    const entry = await row("Wrote tags");
    expect(await within(entry).findByText("Everything written here has been restored.")).toBeInTheDocument();
    expect(within(entry).queryByRole("button", { name: "Restore" })).toBeNull();
  });

  it("shows a failed restore in the engine's words", async () => {
    bridge.getJob.mockResolvedValue({ id: "x", state: "failed", error: { message: "The file is locked" } });
    events = [event(1, "clean.tags.written", { job_id: "w-1" }, "Wrote tags")];
    render(<ActivityPanel open onClose={() => undefined} />);
    const entry = await row("Wrote tags");
    await within(entry).findByText(/can be restored/);
    await userEvent.click(within(entry).getByRole("button", { name: "Restore" }));
    await userEvent.click(within(entry).getByRole("button", { name: "Restore" }));
    expect(await within(entry).findByText(/The file is locked/)).toBeInTheDocument();
  });
});
