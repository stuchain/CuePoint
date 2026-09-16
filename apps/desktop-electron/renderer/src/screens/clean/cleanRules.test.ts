/**
 * The Clean page's questions (CLEAN-12).
 *
 * The review scope is a rule set and nothing else: changing it changes the
 * rules, never where rows come from. The rules the page sends are the ones the
 * real engine answered in `cleanEmpty.fixture.json`, so a renamed field or
 * value fails here rather than as an empty queue.
 */
import { describe, expect, it } from "vitest";

import type { CollectionNode, LibraryPlaylistNode } from "../../api/cuepointBridge.types";
import fixture from "./cleanEmpty.fixture.json";
import {
  MISSING_FILES_RULES,
  REVIEW_SCOPES,
  WHOLE_LIBRARY,
  cleanQuery,
  isReviewScope,
  parseScope,
  reviewRules,
  scopeOptions,
} from "./cleanRules";

describe("the review scopes", () => {
  it("ask what the engine was recorded answering", () => {
    expect(reviewRules("needs_review")).toEqual(fixture.rules.needs_review);
    expect(MISSING_FILES_RULES).toEqual(fixture.rules.missing_files);
  });

  it.each(["needs_review", "accepted", "rejected", "no_match", "not_matched"] as const)(
    "%s is a match state",
    (scope) => {
      expect(reviewRules(scope)).toEqual({
        match: "all",
        rules: [{ field: "match_state", operator: "is", value: scope }],
      });
    },
  );

  it("reads disputed from its own field, as Health counts it", () => {
    expect(reviewRules("disputed")).toEqual({
      match: "all",
      rules: [{ field: "match_disputed", operator: "is", value: true }],
    });
  });

  it("opens on needs review, first in the list", () => {
    expect(REVIEW_SCOPES[0]!.id).toBe("needs_review");
    expect(REVIEW_SCOPES.map((scope) => scope.id)).toHaveLength(6);
  });

  it("knows its own names and nothing else", () => {
    expect(isReviewScope("disputed")).toBe(true);
    expect(isReviewScope("everything")).toBe(false);
  });
});

describe("a scope value", () => {
  it.each([
    [WHOLE_LIBRARY, { playlistId: null, scope: null, collectionId: null }],
    ["playlist:12", { playlistId: 12, scope: null, collectionId: null }],
    ["collection:4", { playlistId: null, scope: "collection", collectionId: 4 }],
    ["smart:5", { playlistId: null, scope: "smart", collectionId: 5 }],
    ["folder:6", { playlistId: null, scope: null, collectionId: null }],
    ["playlist:x", { playlistId: null, scope: null, collectionId: null }],
    ["playlist:0", { playlistId: null, scope: null, collectionId: null }],
  ])("%s points where it says", (value, expected) => {
    expect(parseScope(value)).toEqual(expected);
  });

  it("becomes a Library query with the rules and the order", () => {
    const rules = reviewRules("accepted");
    expect(cleanQuery("playlist:3", rules, { sort: "bpm", dir: "desc" })).toEqual({
      q: "",
      playlistId: 3,
      scope: null,
      collectionId: null,
      filters: rules,
      sort: "bpm",
      dir: "desc",
    });
  });
});

function playlist(id: number, parent: number | null, position: number, name: string, depth: number) {
  return {
    id,
    parent_id: parent,
    name,
    kind: "playlist",
    depth,
    position,
    path: name,
    track_count: 1,
  } as LibraryPlaylistNode;
}

function collection(
  id: number,
  parent: number | null,
  kind: CollectionNode["kind"],
  name: string,
  depth: number,
): CollectionNode {
  return {
    id,
    parent_id: parent,
    kind,
    name,
    position: 0,
    depth,
    rules: null,
    sort: null,
    dir: null,
    frozen_from_id: null,
    frozen_at: null,
    entry_count: 0,
    track_count: 0,
    broken: false,
    problem: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

describe("the places a review can be scoped to", () => {
  it("lists the library, then playlists in tree order, then Collections", () => {
    const options = scopeOptions(
      [
        playlist(3, 1, 1, "Late", 1),
        playlist(1, null, 0, "Friday", 0),
        playlist(2, 1, 0, "Early", 1),
        playlist(9, 77, 0, "Orphan", 2),
      ],
      [
        collection(10, null, "folder", "Sets", 0),
        collection(11, 10, "collection", "Warmups", 1),
        collection(12, null, "smart", "Recent", 0),
      ],
    );

    expect(options.map((option) => option.value)).toEqual([
      WHOLE_LIBRARY,
      "playlist:1",
      "playlist:2",
      "playlist:3",
      "playlist:9",
      "collections",
      "folder:10",
      "collection:11",
      "smart:12",
    ]);
    expect(options.find((o) => o.value === "playlist:2")!.label).toBe("  Early");
    // A Collection folder holds nodes, not tracks: drawn, not chosen.
    expect(options.find((o) => o.value === "folder:10")!.disabled).toBe(true);
    expect(options.find((o) => o.value === "collections")!.disabled).toBe(true);
    expect(options.find((o) => o.value === "smart:12")!.disabled).toBe(false);
  });

  it("is only the library when there is nothing else", () => {
    expect(scopeOptions([], [])).toEqual([{ value: WHOLE_LIBRARY, label: "The whole library" }]);
  });
});
