/**
 * The query a Library view is asking (LIBUI-05).
 *
 * The load-bearing part is `answersQuery`: a response is accepted only if it
 * answers the question being asked *now*, decided from what the engine echoed
 * rather than from a counter the renderer has to remember to increment. Get
 * this wrong and a slow response from the previous sort lands on top of the
 * current one — rows in the wrong order, with nothing to say why.
 */
import { describe, expect, it } from "vitest";

import type {
  FilterRuleSet,
  LibrarySearchResponse,
} from "../../api/cuepointBridge.types";
import {
  DEFAULT_LIBRARY_QUERY,
  answersQuery,
  browseParams,
  queryKey,
  sameQuery,
  type LibraryQuery,
} from "./libraryQuery";

const GENRE_IS_HOUSE: FilterRuleSet = {
  match: "all",
  rules: [{ field: "genre", operator: "is", value: "House" }],
};

function query(overrides: Partial<LibraryQuery> = {}): LibraryQuery {
  return { ...DEFAULT_LIBRARY_QUERY, ...overrides };
}

function response(overrides: Partial<LibrarySearchResponse> = {}): LibrarySearchResponse {
  return {
    query: "",
    total: 0,
    limit: 100,
    offset: 0,
    tracks: [],
    library_empty: false,
    mode: "browse",
    scope: null,
    sort: "artist",
    dir: "asc",
    filters: { match: "all", rules: [] },
    ...overrides,
  };
}

describe("identity", () => {
  it("is the same question written twice", () => {
    expect(sameQuery(query(), query())).toBe(true);
  });

  it.each([
    ["text", { q: "deadmau5" }],
    ["scope", { playlistId: 7 }],
    ["sort", { sort: "bpm" }],
    ["direction", { dir: "desc" as const }],
    ["filters", { filters: GENRE_IS_HOUSE }],
  ])("changes with the %s", (_name, overrides) => {
    expect(sameQuery(query(), query(overrides))).toBe(false);
  });

  it("ignores surrounding space in the text", () => {
    expect(queryKey(query({ q: "  house  " }))).toBe(queryKey(query({ q: "house" })));
  });

  it("treats no filters and an empty rule set as the same question", () => {
    const empty: FilterRuleSet = { match: "all", rules: [] };
    expect(sameQuery(query({ filters: null }), query({ filters: empty }))).toBe(true);
  });
});

describe("a response answering the current query", () => {
  it("accepts one that matches", () => {
    expect(answersQuery(response(), query())).toBe(true);
  });

  it("accepts one carrying the same filters", () => {
    expect(
      answersQuery(
        response({ filters: GENRE_IS_HOUSE }),
        query({ filters: GENRE_IS_HOUSE }),
      ),
    ).toBe(true);
  });

  it.each([
    ["a different sort", { sort: "bpm" }],
    ["a different direction", { dir: "desc" as const }],
    ["a different scope", { scope: 7 }],
    ["different text", { query: "deadmau5" }],
    ["different filters", { filters: GENRE_IS_HOUSE }],
  ])("drops one with %s", (_name, overrides) => {
    expect(answersQuery(response(overrides), query())).toBe(false);
  });

  it("drops a search-mode response", () => {
    // Global search answers a different question with the same shape.
    expect(answersQuery(response({ mode: "search" }), query())).toBe(false);
  });

  it("accepts a response from an engine that does not echo", () => {
    // An older build, or a fixture written before LIBUI-03. Dropping every
    // response would leave a table that never fills — a worse failure than
    // briefly showing the previous sort.
    const { mode: _mode, ...rest } = response();
    expect(answersQuery(rest as LibrarySearchResponse, query())).toBe(true);
  });

  it("accepts one that echoes everything but the filters", () => {
    const { filters: _filters, ...rest } = response();
    expect(answersQuery(rest as LibrarySearchResponse, query())).toBe(true);
  });
});

describe("request parameters", () => {
  it("sends the window it was asked for", () => {
    expect(browseParams(query(), 300, 100)).toMatchObject({ offset: 300, limit: 100 });
  });

  it("sends no text when there is none", () => {
    expect(browseParams(query(), 0, 100).q).toBeUndefined();
  });

  it("trims the text it does send", () => {
    expect(browseParams(query({ q: " house " }), 0, 100).q).toBe("house");
  });

  it("carries the scope, ordering and filters", () => {
    const params = browseParams(
      query({ playlistId: 4, sort: "bpm", dir: "desc", filters: GENRE_IS_HOUSE }),
      0,
      100,
    );
    expect(params).toMatchObject({
      playlistId: 4,
      sort: "bpm",
      dir: "desc",
      filters: GENRE_IS_HOUSE,
    });
  });
});
