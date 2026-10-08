/**
 * The openers that put tracks in Clean's Fix values tab and match window (PAGES-07B).
 *
 * Tracks travel in the router's location state and are checked on arrival: a
 * location can be pushed by any code in the renderer.
 */
import { describe, expect, it } from "vitest";

import {
  cleanFixOpening,
  cleanFixState,
  cleanMatchOpening,
  cleanMatchState,
} from "./cleanLink";

const at = (state: unknown) => ({ state, key: "k1" });

describe("cleanFixState / cleanFixOpening", () => {
  it("carries track ids, and the action to start", () => {
    expect(cleanFixOpening(at(cleanFixState([4, 5, 6], "edit")))).toEqual({
      tracks: { ids: [4, 5, 6] },
      action: "edit",
      token: "k1",
    });
  });

  it("opens with no action when none is named", () => {
    expect(cleanFixOpening(at(cleanFixState([4])))).toEqual({
      tracks: { ids: [4] },
      action: null,
      token: "k1",
    });
  });

  it("carries a described selection and the count it has", () => {
    const query = { filters: { match: "all" as const, rules: [{ field: "key", operator: "is_empty" }] } };
    expect(cleanFixOpening(at(cleanFixState({ query, count: 12 }, "beatport")))).toEqual({
      tracks: { query, count: 12 },
      action: "beatport",
      token: "k1",
    });
  });

  it.each([
    ["nothing", null],
    ["a location with no state", {}],
    ["no tracks", cleanFixState([])],
    ["ids that are not ids", { cuepointCleanFix: { tracks: { ids: [1, "2", -3] } } }],
    ["an action that is not one", { cuepointCleanFix: { tracks: { ids: [1] }, action: "delete" } }],
    ["a rule that is not well formed", {
      cuepointCleanFix: { tracks: { query: { filters: { match: "all", rules: [{ field: 3 }] } }, count: 2 } },
    }],
  ])("ignores %s", (_name, state) => {
    expect(cleanFixOpening(at(state))).toBeNull();
  });

  it("does not take a count that is not a count", () => {
    const state = { cuepointCleanFix: { tracks: { query: {}, count: -1 } } };
    expect(cleanFixOpening(at(state))).toBeNull();
  });
});

describe("cleanMatchState / cleanMatchOpening", () => {
  it("carries track ids", () => {
    expect(cleanMatchOpening(at(cleanMatchState([1, 2])))).toEqual({
      tracks: { ids: [1, 2] },
      token: "k1",
    });
  });

  it("opens with no tracks when none are passed", () => {
    expect(cleanMatchOpening(at(cleanMatchState()))).toEqual({ tracks: null, token: "k1" });
    expect(cleanMatchOpening(at(cleanMatchState([])))).toEqual({ tracks: null, token: "k1" });
  });

  it("carries a described selection", () => {
    const query = { playlist_id: 3, filters: null };
    expect(cleanMatchOpening(at(cleanMatchState({ query, count: 40 })))).toEqual({
      tracks: { query, count: 40 },
      token: "k1",
    });
  });

  it("ignores a location that asks for nothing", () => {
    expect(cleanMatchOpening(at(null))).toBeNull();
    expect(cleanMatchOpening(at({ other: true }))).toBeNull();
  });

  it("drops ids that are not ids rather than matching them", () => {
    expect(cleanMatchOpening(at({ cuepointCleanMatch: { tracks: { ids: [1, "x", 2.5] } } }))).toEqual({
      tracks: null,
      token: "k1",
    });
  });
});
