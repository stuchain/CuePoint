/**
 * What a batch is, and what it says afterwards (ORG-11, DEC-045, DEC-063).
 *
 * The property worth the most: **the selection that crosses the wire means the
 * same tracks as the count on screen**. A described selection that dropped its
 * exclusions would apply to tracks the user deselected, and there is no way to
 * discover that except by looking at what it did — after which there is no
 * undo (DEC-008).
 */
import { describe, expect, it } from "vitest";

import type { BatchResult } from "../../api/cuepointBridge.types";
import {
  BATCH_JOB_THRESHOLD,
  batchOperation,
  batchSelection,
  batchSummary,
  describeBatch,
  type BatchAction,
} from "./libraryBatch";
import { DEFAULT_LIBRARY_QUERY, type LibraryQuery } from "./libraryQuery";
import { EMPTY_SELECTION, type Selection } from "./trackSelection";

function selection(over: Partial<Selection> = {}): Selection {
  return { ...EMPTY_SELECTION, ...over };
}

function query(over: Partial<LibraryQuery> = {}): LibraryQuery {
  return { ...DEFAULT_LIBRARY_QUERY, ...over };
}

function result(over: Partial<BatchResult> = {}): BatchResult {
  return {
    batch_id: "b1",
    operation: "add_tag",
    target: "Peak-time",
    total: 10,
    changed: 10,
    unchanged: 0,
    failed: 0,
    cancelled: false,
    ...over,
  };
}

describe("the tracks a batch applies to", () => {
  it("is the list, when the user picked tracks", () => {
    expect(batchSelection(selection({ ids: new Set([7, 8]) }), query())).toEqual({
      track_ids: [7, 8],
    });
  });

  it("is the question, when the selection is everything matching", () => {
    const payload = batchSelection(
      selection({ all: true }),
      query({ q: "  dub  ", playlistId: 4, filters: null }),
    );
    expect(payload.track_ids).toBeUndefined();
    expect(payload.query).toEqual({
      q: "dub",
      playlist_id: 4,
      collection_id: null,
      filters: null,
    });
  });

  it("carries the tracks taken back out of it", () => {
    // Select all, ctrl-click two out: the toolbar says 47,911 and this is what
    // makes the batch apply to 47,911.
    const payload = batchSelection(
      selection({ all: true, excluded: new Set([3, 9]) }),
      query(),
    );
    expect(payload.exclude_track_ids).toEqual([3, 9]);
  });

  it("leaves the exclusions out when there are none", () => {
    const payload = batchSelection(selection({ all: true }), query());
    expect("exclude_track_ids" in payload).toBe(false);
  });

  it("carries the rules the table is narrowed by", () => {
    // The filter bar's rule set is part of the question, so a batch over
    // "everything matching" has to carry it or it is a batch over the library.
    const filters = {
      match: "all" as const,
      rules: [{ field: "genre", operator: "is", value: "Techno" }],
    };
    const payload = batchSelection(selection({ all: true }), query({ filters }));
    expect(payload.query!.filters).toEqual(filters);
  });

  it("carries CuePoint's own scope, and only when there is one", () => {
    const scoped = batchSelection(
      selection({ all: true }),
      query({ scope: "collection", collectionId: 12 }),
    );
    expect(scoped.query).toMatchObject({ scope: "collection", collection_id: 12 });

    const plain = batchSelection(selection({ all: true }), query());
    expect("scope" in plain.query!).toBe(false);
  });

  it("never sends the ids of a described selection", () => {
    // The whole of DEC-045 in one assertion: 47,913 tracks are a question.
    const payload = batchSelection(
      selection({ all: true, excluded: new Set([1]) }),
      query(),
    );
    expect(payload.track_ids).toBeUndefined();
    expect(JSON.stringify(payload).length).toBeLessThan(200);
  });
});

describe("the operation", () => {
  it("carries the verb and its value, and nothing the renderer invented", () => {
    expect(
      batchOperation({ kind: "add_tag", value: 3, target: "Peak-time" }),
    ).toEqual({ kind: "add_tag", value: 3 });
  });

  it("sends null rather than leaving a rating out, which is how it is cleared", () => {
    expect(batchOperation({ kind: "set_rating", target: "no rating" })).toEqual({
      kind: "set_rating",
      value: null,
    });
  });
});

describe("the question above the threshold", () => {
  const many = 47_913;

  it("names the count and the operation", () => {
    expect(
      describeBatch({ kind: "add_to_collection", value: 4, target: "Closers" }, many),
    ).toBe("Add 47,913 tracks to “Closers”?");
  });

  it("says what a rating would be, in stars", () => {
    expect(describeBatch({ kind: "set_rating", value: 4, target: "4" }, 12)).toBe(
      "Rate 12 tracks ★★★★?",
    );
  });

  it("tells clearing a rating from rating it zero (DEC-057)", () => {
    expect(describeBatch({ kind: "set_rating", value: null, target: "" }, 12)).toBe(
      "Clear the CuePoint rating on 12 tracks?",
    );
    expect(describeBatch({ kind: "set_rating", value: 0, target: "0" }, 12)).toBe(
      "Rate 12 tracks zero stars?",
    );
  });

  it("has a different sentence for each of the six operations", () => {
    const actions: BatchAction[] = [
      { kind: "set_rating", value: 3, target: "3" },
      { kind: "set_favorite", value: true, target: "favorite" },
      { kind: "add_tag", value: 1, target: "Peak-time" },
      { kind: "remove_tag", value: 1, target: "Peak-time" },
      { kind: "add_to_collection", value: 2, target: "Closers" },
      { kind: "remove_from_collection", value: 2, target: "Closers" },
    ];
    const said = actions.map((action) => describeBatch(action, 5));
    expect(new Set(said).size).toBe(actions.length);
  });

  it("counts one track as one", () => {
    expect(describeBatch({ kind: "set_favorite", value: true, target: "" }, 1)).toBe(
      "Favorite 1 track?",
    );
  });

  it("is asked at the number the engine forks a job at", () => {
    // A confirmation for work that finished on the request thread is a warning
    // about nothing; a job started without one is the opposite mistake.
    expect(BATCH_JOB_THRESHOLD).toBe(1_000);
  });
});

describe("what it says afterwards", () => {
  const tag: BatchAction = { kind: "add_tag", value: 1, target: "Peak-time" };

  it("counts what changed, not what it looked at", () => {
    expect(batchSummary(tag, result({ total: 52, changed: 40, unchanged: 12 }))).toContain(
      "Tagged 40 tracks “Peak-time” — 12 already had it.",
    );
  });

  it("says nothing about unchanged tracks when there were none", () => {
    expect(batchSummary(tag, result({ total: 3, changed: 3 }))).toContain(
      "Tagged 3 tracks “Peak-time”.",
    );
  });

  it("reports the tracks it could not touch", () => {
    const summary = batchSummary(
      tag,
      result({ total: 10, changed: 8, unchanged: 0, failed: 2 }),
    );
    expect(summary).toContain("2 could not be changed");
  });

  it("says a batch stopped early rather than reporting it as finished", () => {
    const summary = batchSummary(
      tag,
      result({ total: 50_000, changed: 900, unchanged: 0, failed: 0, cancelled: true }),
    );
    expect(summary).toMatch(/^Stopped early\./);
  });

  it("has its own sentence for a track that was already the way it was asked to be", () => {
    const said = (action: BatchAction) =>
      batchSummary(action, result({ total: 2, changed: 1, unchanged: 1 }));
    const lines = [
      said({ kind: "set_rating", value: 3, target: "3" }),
      said({ kind: "set_favorite", value: true, target: "" }),
      said({ kind: "set_favorite", value: false, target: "" }),
      said({ kind: "add_tag", value: 1, target: "x" }),
      said({ kind: "remove_tag", value: 1, target: "x" }),
      said({ kind: "add_to_collection", value: 1, target: "x" }),
      said({ kind: "remove_from_collection", value: 1, target: "x" }),
    ];
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("has its own verb for each of the six operations", () => {
    // "Removed 40 tracks from Closers" and "Added 40 tracks to Closers" are
    // opposite facts, and a shared verb makes the toast say the wrong one.
    const said = (action: BatchAction) =>
      batchSummary(action, result({ total: 1, changed: 1 }));
    const lines = [
      said({ kind: "set_rating", value: 3, target: "3" }),
      said({ kind: "set_rating", value: null, target: "" }),
      said({ kind: "set_favorite", value: true, target: "" }),
      said({ kind: "set_favorite", value: false, target: "" }),
      said({ kind: "add_tag", value: 1, target: "x" }),
      said({ kind: "remove_tag", value: 1, target: "x" }),
      said({ kind: "add_to_collection", value: 1, target: "x" }),
      said({ kind: "remove_from_collection", value: 1, target: "x" }),
    ];
    expect(new Set(lines).size).toBe(lines.length);
    expect(
      batchSummary(
        { kind: "remove_from_collection", value: 1, target: "Closers" },
        result({ total: 1, changed: 1 }),
      ),
    ).toBe("Removed 1 track from “Closers”.");
  });

  it("points at the History, because there is no undo (DEC-008)", () => {
    expect(batchSummary(tag, result({ total: 40, changed: 40 }))).toContain("History");
  });

  it("says nothing about undo for a single track", () => {
    // A toast longer than the edit it describes is a toast nobody reads.
    expect(batchSummary(tag, result({ total: 1, changed: 1 }))).not.toContain("History");
  });
});
