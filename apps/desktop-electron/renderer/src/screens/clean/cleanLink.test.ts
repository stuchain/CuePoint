/**
 * The openers that put tracks in Clean's match window (PAGES-07B), and the redirects for
 * the two tabs K3 removed.
 *
 * Tracks travel in the router's location state and are checked on arrival: a
 * location can be pushed by any code in the renderer.
 */
import { describe, expect, it } from "vitest";

import * as links from "./cleanLink";
import { cleanMatchOpening, cleanMatchState, cleanRedirect, openClean } from "./cleanLink";
import { statisticsFocus } from "../statistics/statisticsLink";

const at = (state: unknown) => ({ state, key: "k1" });

describe("cleanRedirect (K3)", () => {
  it("sends the old Health address to Statistics, on its Health section", () => {
    const to = cleanRedirect({ state: { cuepointCleanSection: "health" } });
    expect(to?.to).toBe("/statistics");
    expect(statisticsFocus({ state: to?.state })?.focus).toBe("health");
  });

  it("does the same for ?section=health", () => {
    const to = cleanRedirect({ state: null, search: "?section=health" });
    expect(to?.to).toBe("/statistics");
    expect(statisticsFocus({ state: to?.state })?.focus).toBe("health");
  });

  it("sends the old Fix values address to the Library", () => {
    expect(cleanRedirect({ state: { cuepointCleanSection: "fix" } })).toEqual({ to: "/library" });
    expect(cleanRedirect({ state: undefined, search: "?section=fix" })).toEqual({ to: "/library" });
  });

  it.each([
    ["a part Clean still has", { cuepointCleanSection: "missing" }, ""],
    ["no state", null, ""],
    ["a search for a part Clean still has", null, "?section=duplicates"],
    ["an address with no section", { other: true }, "?x=1"],
  ])("leaves %s alone", (_name, state, search) => {
    expect(cleanRedirect({ state, search })).toBeNull();
  });

  it("no longer builds Fix values openers", () => {
    expect(links).not.toHaveProperty("cleanFixState");
    expect(links).not.toHaveProperty("cleanFixOpening");
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

describe("openClean (M505)", () => {
  it("opens Clean with the tracks chosen, as every other page's menu does", () => {
    const calls: unknown[][] = [];
    openClean((...args) => calls.push(args), [3, 4]);
    expect(calls).toEqual([["/clean", { state: cleanMatchState([3, 4]) }]]);
    expect(cleanMatchOpening({ state: (calls[0]![1] as { state: unknown }).state, key: "k" })?.tracks).toEqual({
      ids: [3, 4],
    });
  });

  it("opens on the tracks not looked up yet with none", () => {
    const calls: unknown[][] = [];
    openClean((...args) => calls.push(args));
    expect(cleanMatchOpening({ state: (calls[0]![1] as { state: unknown }).state, key: "k" })?.tracks).toBeNull();
  });
});
