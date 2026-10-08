/**
 * Opening the Library on a Health count's rules (CLEAN-12).
 *
 * A location's state can be pushed by any code in the renderer, so what it
 * carries is checked before it becomes a query.
 */
import { describe, expect, it } from "vitest";

import type { FilterRuleSet } from "../../api/cuepointBridge.types";
import {
  libraryOpening,
  libraryRefreshState,
  libraryRulesState,
  libraryImportState,
  libraryTrackState,
  importOpening,
  refreshOpening,
  rulesFromLocationState,
  trackFromLocationState,
  trackOpening,
} from "./libraryLink";

const RULES: FilterRuleSet = {
  match: "all",
  rules: [
    { field: "file_status", operator: "any_of", value: ["missing", "unreadable"] },
    { field: "key", operator: "is_empty" },
  ],
};

describe("rules carried by a navigation", () => {
  it("come back exactly as they were sent", () => {
    expect(rulesFromLocationState(libraryRulesState(RULES))).toEqual(RULES);
  });

  it("keep a rule with no value without inventing one", () => {
    const back = rulesFromLocationState(libraryRulesState(RULES))!;
    expect("value" in back.rules[1]!).toBe(false);
  });

  it.each([
    ["nothing", null],
    ["a string", "rules"],
    ["another page's state", { from: "search" }],
    ["rules that match any", { cuepointLibraryRules: { match: "any", rules: RULES.rules } }],
    ["no rules", { cuepointLibraryRules: { match: "all", rules: [] } }],
    ["rules that are not a list", { cuepointLibraryRules: { match: "all", rules: {} } }],
    [
      "a rule without an operator",
      { cuepointLibraryRules: { match: "all", rules: [{ field: "key" }] } },
    ],
    ["a rule that is not an object", { cuepointLibraryRules: { match: "all", rules: [7] } }],
  ])("are refused when they are %s", (_what, state) => {
    expect(rulesFromLocationState(state)).toBeNull();
  });

  it("open once per navigation", () => {
    const first = libraryOpening({ state: libraryRulesState(RULES), key: "a" });
    const again = libraryOpening({ state: libraryRulesState(RULES), key: "b" });
    expect(first).toEqual({ rules: RULES, token: "a" });
    expect(again?.token).toBe("b");
    expect(libraryOpening({ state: null, key: "c" })).toBeNull();
  });
});

describe("a refresh asked for by another page (PREP-10)", () => {
  it("names the navigation that asked, and nothing else", () => {
    expect(refreshOpening({ state: libraryRefreshState(), key: "k1" })).toBe("k1");
    expect(refreshOpening({ state: null, key: "k2" })).toBeNull();
    expect(refreshOpening({ state: { cuepointLibraryRefresh: "yes" }, key: "k3" })).toBeNull();
    expect(refreshOpening({ state: "refresh", key: "k4" })).toBeNull();
  });
});

describe("one track carried by a navigation (HDR-1)", () => {
  it("comes back as the id that was sent", () => {
    expect(trackFromLocationState(libraryTrackState(42))).toBe(42);
  });

  it("is applied once per navigation: its token is the location's key", () => {
    expect(trackOpening({ state: libraryTrackState(42), key: "k1" })).toEqual({
      trackId: 42,
      token: "k1",
    });
    expect(trackOpening({ state: libraryTrackState(42), key: "k2" })?.token).toBe("k2");
  });

  it.each([
    ["nothing", null],
    ["a string", "7"],
    ["rules only", libraryRulesState(RULES)],
    ["a text id", { cuepointLibraryTrack: "7" }],
    ["a fraction", { cuepointLibraryTrack: 1.5 }],
    ["zero", { cuepointLibraryTrack: 0 }],
    ["a negative id", { cuepointLibraryTrack: -3 }],
  ])("refuses %s", (_name, state) => {
    expect(trackFromLocationState(state)).toBeNull();
    expect(trackOpening({ state, key: "k" })).toBeNull();
  });

  it("does not look like rules or a refresh", () => {
    expect(rulesFromLocationState(libraryTrackState(1))).toBeNull();
    expect(refreshOpening({ state: libraryTrackState(1), key: "k" })).toBeNull();
    expect(libraryOpening({ state: libraryTrackState(1), key: "k" })).toBeNull();
  });
});

describe("an import asked for by the File menu (FLW-20)", () => {
  it("is a token for the navigation that asked, and only that one", () => {
    expect(importOpening({ state: libraryImportState(), key: "k1" })).toBe("k1");
    expect(importOpening({ state: libraryImportState(), key: "k2" })).toBe("k2");
  });

  it.each([["nothing", null], ["rules", libraryRulesState(RULES)], ["a refresh", libraryRefreshState()], ["a track", libraryTrackState(3)]])(
    "is not read from %s",
    (_name, state) => {
      expect(importOpening({ state, key: "k" })).toBeNull();
    },
  );

  it("does not make a refresh, rules or a track", () => {
    expect(refreshOpening({ state: libraryImportState(), key: "k" })).toBeNull();
    expect(libraryOpening({ state: libraryImportState(), key: "k" })).toBeNull();
    expect(trackOpening({ state: libraryImportState(), key: "k" })).toBeNull();
  });
});
