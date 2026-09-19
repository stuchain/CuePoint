/**
 * What an Activity entry offers (CLEAN-13).
 *
 * Decided from what the engine recorded: a batch offers a revert — disabled,
 * with its reason, for Collection membership — and a tag write offers Restore.
 * Unconfirmed writes are counted as unfinished, never as written.
 */
import { describe, expect, it } from "vitest";

import type {
  ActivityEvent,
  BatchRevertResult,
  TagRestoreResult,
} from "../../api/cuepointBridge.types";
import {
  MEMBERSHIP_REVERT_REASON,
  activityOffer,
  restoredLine,
  resumeOfferLine,
  revertedLine,
  writesLine,
} from "./activityActions";

function event(type: string, detail: Record<string, unknown>): ActivityEvent {
  return { id: 1, type, summary: "s", detail, created_at: "2026-09-16T10:00:00Z" };
}

describe("a batch's entry", () => {
  it("offers reverting the batch it names", () => {
    expect(activityOffer(event("library.batch", { batch_id: "b-1", operation: "set_rating", changed: 3 }))).toEqual({
      kind: "revert-batch",
      batchId: "b-1",
      disabledReason: null,
    });
  });

  it("offers reverting a revert, which is a batch too", () => {
    const offer = activityOffer(
      event("library.batch_reverted", { batch_id: "b-2", operation: "revert_batch", changed: 3 }),
    );
    expect(offer).toMatchObject({ kind: "revert-batch", batchId: "b-2", disabledReason: null });
  });

  it.each(["add_to_collection", "remove_from_collection"])(
    "draws the control disabled with its reason for %s",
    (operation) => {
      expect(activityOffer(event("library.batch", { batch_id: "b-3", operation, changed: 5 }))).toEqual({
        kind: "revert-batch",
        batchId: "b-3",
        disabledReason: MEMBERSHIP_REVERT_REASON,
      });
    },
  );

  it("says a batch that changed nothing has nothing to revert", () => {
    const offer = activityOffer(event("library.batch", { batch_id: "b-4", operation: "add_tag", changed: 0 }));
    expect(offer).toMatchObject({ disabledReason: expect.stringContaining("changed nothing") });
  });

  it("offers nothing without a batch to name", () => {
    expect(activityOffer(event("library.batch", { operation: "add_tag" }))).toBeNull();
    expect(activityOffer(event("library.batch", { batch_id: "  " }))).toBeNull();
  });
});

describe("a tag write's entry", () => {
  it("offers restoring the job it names", () => {
    expect(activityOffer(event("clean.tags.written", { job_id: "w-1" }))).toEqual({
      kind: "restore-tags",
      jobIds: ["w-1"],
      interrupted: false,
    });
  });

  it("offers restoring what a stopped write or restore was working on", () => {
    expect(
      activityOffer(event("clean.tags.interrupted", { job_id: "r-1", write_job_ids: ["w-1", "w-2", 7] })),
    ).toEqual({ kind: "restore-tags", jobIds: ["w-1", "w-2"], interrupted: true });
    expect(activityOffer(event("clean.tags.interrupted", { job_id: "r-1" }))).toBeNull();
    expect(activityOffer(event("clean.tags.written", {}))).toBeNull();
  });

  it("offers nothing on a restore's own entry, or on anything else", () => {
    expect(activityOffer(event("clean.tags.restored", { job_id: "r-1" }))).toBeNull();
    expect(activityOffer(event("library.imported", { batch_id: "x" }))).toBeNull();
  });
});

describe("an interrupted match's entry (CLEAN-14)", () => {
  it("offers resuming the match it names", () => {
    expect(
      activityOffer(event("clean.match.interrupted", { job_id: "m-1", remaining: 12, planned: 50 })),
    ).toEqual({ kind: "resume-match", jobId: "m-1" });
  });

  it("offers nothing without a job to resume", () => {
    expect(activityOffer(event("clean.match.interrupted", {}))).toBeNull();
    expect(activityOffer(event("clean.match.interrupted", { job_id: " " }))).toBeNull();
    expect(activityOffer(event("clean.match", { job_id: "m-1" }))).toBeNull();
  });

  it("says how much is left, or that nothing is", () => {
    expect(resumeOfferLine(12)).toBe("12 tracks left to match.");
    expect(resumeOfferLine(1)).toBe("1 track left to match.");
    expect(resumeOfferLine(null)).toBe("Nothing is left to resume.");
  });
});

describe("what a record of writes says", () => {
  it("never calls an unconfirmed write written", () => {
    expect(writesLine(5, 2)).toBe(
      "2 writes may not have finished, and 3 values were written. Restore puts every file back.",
    );
    expect(writesLine(2, 2)).toBe(
      "2 writes may not have finished. Restore puts every file back; a file still holding its old value counts as restored.",
    );
  });

  it("counts confirmed writes, and says when all are restored", () => {
    expect(writesLine(1, 0)).toBe("1 value written to files can be restored.");
    expect(writesLine(0, 0)).toBe("Everything written here has been restored.");
  });
});

function reverted(overrides: Partial<BatchRevertResult> = {}): BatchRevertResult {
  return {
    batch_id: "n",
    operation: "revert_batch",
    target: "b",
    total: 5,
    changed: 3,
    unchanged: 1,
    failed: 0,
    cancelled: false,
    skipped: 1,
    revert_of: "b",
    ...overrides,
  };
}

function restored(overrides: Partial<TagRestoreResult> = {}): TagRestoreResult {
  return {
    job_id: "r",
    restored_job_id: "w",
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
    ...overrides,
  };
}

describe("what an action says when it is done", () => {
  it("counts a revert's changes, skips and failures", () => {
    expect(revertedLine(reverted())).toBe(
      "Reverted 3 changes, 1 skipped because the value changed since, 1 already in place.",
    );
    expect(revertedLine(reverted({ changed: 1, skipped: 0, unchanged: 0, failed: 2, cancelled: true }))).toBe(
      "Stopped early. Reverted 1 change, 2 could not be reverted.",
    );
    expect(revertedLine(null)).toBe("Reverted.");
  });

  it("adds up restores", () => {
    expect(restoredLine([restored(), restored({ files: 1, skipped: 2, failed: 1 })])).toBe(
      "Restored 3 files, 2 values left alone because the file changed since, 1 could not be restored.",
    );
    expect(restoredLine([])).toBe("Restored 0 files.");
  });
});
