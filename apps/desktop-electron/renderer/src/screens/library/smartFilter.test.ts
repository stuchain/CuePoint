/**
 * The bar's rules and the Smart Collection they came from (ORG-12, DEC-016).
 *
 * Two properties are worth more than the rest:
 *
 * **Saving translates nothing.** The rules that cross the wire are the rules
 * in the bar, object for object. LIBUI-02 said Phase 6 would inherit the filter
 * model rather than convert it, and a conversion step here would be a second
 * definition of what a rule means.
 *
 * **A saved rule set does not change because somebody browsed.** Narrowing a
 * Smart Collection is a thing people do all day; rewriting one is a thing they
 * do deliberately. Anything that blurs the two loses work nobody knew they had.
 */
import { describe, expect, it } from "vitest";

import type { FilterRuleSet } from "../../api/cuepointBridge.types";
import {
  SMART_NAME_MAX_LENGTH,
  canSaveSmart,
  checkSmartName,
  isModified,
  sameRuleSet,
  smartQuery,
  smartStatus,
  type SmartAttachment,
} from "./smartFilter";

const HOUSE: FilterRuleSet = {
  match: "all",
  rules: [{ field: "genre", operator: "is", value: "House" }],
};

const HOUSE_AND_FAST: FilterRuleSet = {
  match: "all",
  rules: [
    { field: "genre", operator: "is", value: "House" },
    { field: "bpm", operator: "gte", value: 128 },
  ],
};

function attached(over: Partial<SmartAttachment> = {}): SmartAttachment {
  return { id: 4, name: "Closers", saved: HOUSE, ...over };
}

describe("whether two rule sets ask the same question", () => {
  it("sees a copy as the same", () => {
    expect(sameRuleSet(HOUSE, { match: "all", rules: [...HOUSE.rules] })).toBe(true);
  });

  it("sees one more clause as different", () => {
    expect(sameRuleSet(HOUSE, HOUSE_AND_FAST)).toBe(false);
  });

  it("sees a different value as different", () => {
    expect(
      sameRuleSet(HOUSE, {
        match: "all",
        rules: [{ field: "genre", operator: "is", value: "Techno" }],
      }),
    ).toBe(false);
  });

  it("sees a different operator as different", () => {
    expect(
      sameRuleSet(HOUSE, {
        match: "all",
        rules: [{ field: "genre", operator: "contains", value: "House" }],
      }),
    ).toBe(false);
  });

  it("sees a different field as different", () => {
    expect(
      sameRuleSet(HOUSE, {
        match: "all",
        rules: [{ field: "album", operator: "is", value: "House" }],
      }),
    ).toBe(false);
  });

  it("compares a range value by value rather than by identity", () => {
    const range: FilterRuleSet = {
      match: "all",
      rules: [{ field: "bpm", operator: "between", value: [120, 128] }],
    };
    expect(
      sameRuleSet(range, {
        match: "all",
        rules: [{ field: "bpm", operator: "between", value: [120, 128] }],
      }),
    ).toBe(true);
    expect(
      sameRuleSet(range, {
        match: "all",
        rules: [{ field: "bpm", operator: "between", value: [120, 130] }],
      }),
    ).toBe(false);
  });

  it("does not read a list as the single value it holds", () => {
    expect(
      sameRuleSet(
        { match: "all", rules: [{ field: "tag", operator: "any_of", value: [7] }] },
        { match: "all", rules: [{ field: "tag", operator: "has_tag", value: 7 }] },
      ),
    ).toBe(false);
  });

  it("treats a missing value and a null one as the same absence", () => {
    expect(
      sameRuleSet(
        { match: "all", rules: [{ field: "genre", operator: "is_empty" }] },
        { match: "all", rules: [{ field: "genre", operator: "is_empty", value: null }] },
      ),
    ).toBe(true);
  });

  it("sees no rules and none at all as the same", () => {
    expect(sameRuleSet(null, null)).toBe(true);
  });

  it("tells all-of from any-of, which v1 does not write and will", () => {
    // MATCH_ANY is declared and reserved in the engine (DEC-016) and refused
    // today, which is why `FilterRuleSet.match` is the single literal "all"
    // and why this is a cast rather than a value. It is a shape that arrives
    // as JSON, so the comparison has to hold for it before the type widens:
    // "all of these" and "any of these" must never read as the same question.
    const any = { ...HOUSE, match: "any" } as unknown as FilterRuleSet;
    expect(sameRuleSet(HOUSE, any)).toBe(false);
  });

  it("reads a reorder as a change, because a user did it", () => {
    expect(
      sameRuleSet(HOUSE_AND_FAST, {
        match: "all",
        rules: [...HOUSE_AND_FAST.rules].reverse(),
      }),
    ).toBe(false);
  });
});

describe("whether the bar has been changed", () => {
  it("is not modified with nothing attached, however the rules read", () => {
    expect(isModified(null, HOUSE_AND_FAST)).toBe(false);
  });

  it("is not modified while the rules are what was saved", () => {
    expect(isModified(attached(), HOUSE)).toBe(false);
  });

  it("is modified once a clause is added", () => {
    expect(isModified(attached(), HOUSE_AND_FAST)).toBe(true);
  });

  it("is modified once the last clause is taken out", () => {
    expect(isModified(attached(), null)).toBe(true);
  });
});

describe("what the table is asked", () => {
  it("asks for the bar's rules when nothing is attached", () => {
    expect(smartQuery(null, HOUSE)).toEqual({ filters: HOUSE });
  });

  it("leaves the scope alone when nothing is attached", () => {
    // A playlist and a plain Collection are scopes the page set; the bar
    // speaks only for a Smart Collection, and clearing them here would drop a
    // user out of the Collection they are standing in.
    const asked = smartQuery(null, HOUSE);
    expect("scope" in asked).toBe(false);
    expect("collectionId" in asked).toBe(false);
  });

  it("asks for the Collection by id while it is unchanged", () => {
    // Not by sending a copy of its rules: the engine resolves the saved rules,
    // so what the table shows is what the Smart Collection *is*.
    expect(smartQuery(attached(), HOUSE)).toEqual({
      filters: null,
      scope: "smart",
      collectionId: 4,
    });
  });

  it("does not send the rules twice while it is unchanged", () => {
    // Sent as well as resolved they would be ANDed with themselves — correct,
    // and twice the clauses for the same answer.
    expect(smartQuery(attached(), HOUSE).filters).toBeNull();
  });

  it("asks for the rules on screen once they are changed", () => {
    // A user who removes a clause and sees the same rows has been told
    // nothing about what they just did.
    expect(smartQuery(attached(), HOUSE_AND_FAST)).toEqual({
      filters: HOUSE_AND_FAST,
      scope: null,
      collectionId: null,
    });
  });

  it("sends the rules as they are, with nothing added and nothing renamed", () => {
    const asked = smartQuery(attached(), HOUSE_AND_FAST);
    expect(asked.filters).toBe(HOUSE_AND_FAST);
  });
});

describe("what the bar says about it", () => {
  it("says nothing when no Collection is open", () => {
    expect(smartStatus(null, HOUSE)).toBeNull();
  });

  it("names the Collection while it is unchanged", () => {
    expect(smartStatus(attached(), HOUSE)).toBe("Smart Collection “Closers”");
  });

  it("says it is modified and not saved once it is changed", () => {
    const said = smartStatus(attached(), HOUSE_AND_FAST);
    expect(said).toContain("modified");
    expect(said).toContain("not saved");
  });
});

describe("naming one", () => {
  it("takes a name", () => {
    expect(checkSmartName("  Peak-time openers  ")).toEqual({
      ok: true,
      name: "Peak-time openers",
    });
  });

  it("refuses a name that is only spaces", () => {
    expect(checkSmartName("   ")).toEqual({ ok: false, reason: "Give it a name" });
  });

  it("refuses one longer than the engine takes", () => {
    const long = checkSmartName("x".repeat(SMART_NAME_MAX_LENGTH + 1));
    expect(long.ok).toBe(false);
  });

  it("takes one exactly as long as the engine takes", () => {
    expect(checkSmartName("x".repeat(SMART_NAME_MAX_LENGTH)).ok).toBe(true);
  });
});

describe("what can be saved", () => {
  it("saves a rule set", () => {
    expect(canSaveSmart(HOUSE).ok).toBe(true);
  });

  it("refuses to save no rules, which would be the whole library", () => {
    const refused = canSaveSmart(null);
    expect(refused.ok).toBe(false);
    expect(refused.why).toContain("Add a filter");
  });

  it("refuses an empty rule set as firmly as a missing one", () => {
    expect(canSaveSmart({ match: "all", rules: [] }).ok).toBe(false);
  });
});
