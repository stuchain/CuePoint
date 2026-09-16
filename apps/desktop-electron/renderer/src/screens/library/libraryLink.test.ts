/**
 * Opening the Library on a Health count's rules (CLEAN-12).
 *
 * A location's state can be pushed by any code in the renderer, so what it
 * carries is checked before it becomes a query.
 */
import { describe, expect, it } from "vitest";

import type { FilterRuleSet } from "../../api/cuepointBridge.types";
import { libraryOpening, libraryRulesState, rulesFromLocationState } from "./libraryLink";

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
