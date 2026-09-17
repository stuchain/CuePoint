/**
 * The batch vocabulary's Clean operations, and what a batch says about revert (CLEAN-13).
 *
 * Accepting, rejecting, applying and typing values run as ORG-11's batches, so
 * they need the same sentences: the confirmation above the threshold, and the
 * counts afterwards. And since a batch can now be reverted from Activity, the
 * sentences say so — except for Collection membership, which cannot be.
 */
import { describe, expect, it } from "vitest";

import type { BatchResult } from "../../api/cuepointBridge.types";
import {
  batchConsequence,
  batchOperation,
  batchSummary,
  canRevertKind,
  describeBatch,
  type BatchAction,
  type LibraryBatchKind,
} from "./libraryBatch";
import { fieldWords } from "./useLibraryClean";

function result(over: Partial<BatchResult> = {}): BatchResult {
  return {
    batch_id: "b1",
    operation: "accept_match",
    target: "Beatport match",
    total: 10,
    changed: 10,
    unchanged: 0,
    failed: 0,
    cancelled: false,
    ...over,
  };
}

const accept: BatchAction = { kind: "accept_match", target: "Beatport match" };
const reject: BatchAction = { kind: "reject_match", target: "Beatport match" };
const apply: BatchAction = { kind: "apply_match", value: ["key", "bpm"], target: "key and BPM" };
const setBpm: BatchAction = {
  kind: "set_override",
  value: { field: "bpm", value: 128 },
  target: "BPM to 128",
};
const clearKey: BatchAction = {
  kind: "set_override",
  value: { field: "key", value: null },
  target: "key",
};

describe("the question above the threshold", () => {
  it.each([
    [accept, "Accept the proposed Beatport match on 2,000 tracks?"],
    [reject, "Reject the proposed Beatport match on 2,000 tracks?"],
    [apply, "Apply Beatport's key and BPM to 2,000 tracks?"],
    [setBpm, "Set the BPM to 128 on 2,000 tracks?"],
    [clearKey, "Clear your key on 2,000 tracks?"],
  ])("%j", (action, question) => {
    expect(describeBatch(action, 2000)).toBe(question);
  });
});

describe("what happened", () => {
  it("counts decisions, and says why the rest were left", () => {
    expect(batchSummary(accept, result({ changed: 1, unchanged: 3 }))).toBe(
      "Accepted the match on 1 track — 3 were already decided or had nothing proposed.",
    );
    expect(batchSummary(reject, result({ changed: 1 }))).toBe("Rejected the match on 1 track.");
  });

  it("counts applied and typed values", () => {
    expect(batchSummary(apply, result({ changed: 1, unchanged: 2 }))).toBe(
      "Applied Beatport's key and BPM to 1 track — 2 had no accepted match or already held those values.",
    );
    expect(batchSummary(setBpm, result({ changed: 1, unchanged: 1 }))).toBe(
      "Set the BPM to 128 on 1 track — 1 already had it.",
    );
    expect(batchSummary(clearKey, result({ changed: 1, unchanged: 4 }))).toBe(
      "Cleared your key on 1 track — 4 had none.",
    );
  });

  it("points at Activity for a batch that can be reverted", () => {
    expect(batchSummary(setBpm, result({ changed: 40 }))).toBe(
      "Set the BPM to 128 on 40 tracks. Each change is in the track's History, and the whole batch can be reverted from Activity.",
    );
  });

  it("says there is no undo for Collection membership", () => {
    const add: BatchAction = { kind: "add_to_collection", value: 1, target: "Closers" };
    expect(batchSummary(add, result({ changed: 40 }))).toBe(
      "Added 40 tracks to “Closers”. There is no undo for Collection changes.",
    );
  });
});

describe("what can be reverted", () => {
  const kinds: LibraryBatchKind[] = [
    "set_rating",
    "set_favorite",
    "add_tag",
    "remove_tag",
    "accept_match",
    "reject_match",
    "apply_match",
    "set_override",
  ];

  it.each(kinds)("a %s batch", (kind) => {
    expect(canRevertKind(kind)).toBe(true);
    expect(batchConsequence(kind)).toMatch(/reverted from Activity/);
  });

  it.each(["add_to_collection", "remove_from_collection"] as const)("not a %s batch", (kind) => {
    expect(canRevertKind(kind)).toBe(false);
    expect(batchConsequence(kind)).toMatch(/no undo/);
  });
});

describe("the operation on the wire", () => {
  it("sends no value for a decision, which takes none", () => {
    expect(batchOperation(accept)).toEqual({ kind: "accept_match" });
    expect(batchOperation(reject)).toEqual({ kind: "reject_match" });
  });

  it("sends the fields an apply copies, and a hand edit whole", () => {
    expect(batchOperation(apply)).toEqual({ kind: "apply_match", value: ["key", "bpm"] });
    expect(batchOperation(setBpm)).toEqual({
      kind: "set_override",
      value: { field: "bpm", value: 128 },
    });
    expect(batchOperation(clearKey)).toEqual({
      kind: "set_override",
      value: { field: "key", value: null },
    });
  });
});

describe("fields in a sentence", () => {
  it("reads as a list", () => {
    expect(fieldWords(["key"])).toBe("key");
    expect(fieldWords(["key", "bpm"])).toBe("key and BPM");
    expect(fieldWords(["genre", "label", "year"])).toBe("genre, label and year");
    expect(fieldWords([])).toBe("");
  });
});
