/**
 * Reading and writing filter clauses (LIBUI-08, DEC-043).
 *
 * The property under everything here: **the renderer invents no vocabulary**.
 * Which fields exist, which operators each allows and how many values an
 * operator takes all arrive from the engine, so a control cannot offer a
 * clause the engine would refuse. These tests drive that by handing in a
 * vocabulary and checking nothing is assumed beyond it.
 */
import { describe, expect, it } from "vitest";

import type {
  FilterRuleSet,
  LibraryFilterVocabulary,
} from "../../api/cuepointBridge.types";
import {
  addRule,
  arityOf,
  buildRule,
  describeRule,
  emptyDraft,
  fieldOf,
  operatorLabel,
  operatorsFor,
  removeRule,
  ruleCount,
  starsFor,
  withField,
  type DraftRule,
} from "./filterText";

const VOCABULARY: LibraryFilterVocabulary = {
  fields: [
    {
      name: "genre",
      type: "text",
      label: "Genre",
      facetable: true,
      integer: false,
      operators: ["is", "contains", "any_of", "is_empty"],
    },
    {
      name: "bpm",
      type: "number",
      label: "BPM",
      facetable: false,
      integer: false,
      operators: ["is", "gte", "between", "is_empty"],
    },
    {
      name: "rating",
      type: "number",
      label: "Rating",
      facetable: true,
      integer: true,
      operators: ["is", "gte", "any_of", "is_empty"],
    },
    {
      name: "date_added",
      type: "date",
      label: "Date added",
      facetable: false,
      integer: false,
      operators: ["before", "after", "between", "is_empty"],
    },
  ],
  operators: {
    is: { arity: "single" },
    contains: { arity: "single" },
    gte: { arity: "single" },
    before: { arity: "single" },
    after: { arity: "single" },
    between: { arity: "pair" },
    any_of: { arity: "list" },
    is_empty: { arity: "none" },
  },
  facetable: ["genre", "rating"],
  sortable: ["artist", "bpm"],
};

function draft(overrides: Partial<DraftRule> = {}): DraftRule {
  return { field: "genre", operator: "is", value: "", secondValue: "", ...overrides };
}

describe("the vocabulary is the engine's", () => {
  it("offers exactly the operators a field allows", () => {
    expect(operatorsFor(VOCABULARY, "bpm")).toEqual(["is", "gte", "between", "is_empty"]);
  });

  it("offers nothing for a field it has never heard of", () => {
    expect(operatorsFor(VOCABULARY, "vibe")).toEqual([]);
    expect(fieldOf(VOCABULARY, "vibe")).toBeNull();
  });

  it("takes arity from the engine", () => {
    expect(arityOf(VOCABULARY, "between")).toBe("pair");
    expect(arityOf(VOCABULARY, "any_of")).toBe("list");
    expect(arityOf(VOCABULARY, "is_empty")).toBe("none");
  });

  it("assumes one value for an operator it was told nothing about", () => {
    // A clause with an unwanted value is refused with a message; one missing a
    // value it needs cannot be built at all.
    expect(arityOf(VOCABULARY, "sounds_like")).toBe("single");
    expect(arityOf(null, "is")).toBe("single");
  });

  it("keeps an operator when the new field also allows it", () => {
    const next = withField(VOCABULARY, draft({ operator: "is" }), "bpm");
    expect(next).toMatchObject({ field: "bpm", operator: "is" });
  });

  it("changes the operator when the new field does not allow it", () => {
    // Genre "contains" is not something BPM can do; leaving it selected would
    // offer a clause the engine refuses.
    const next = withField(VOCABULARY, draft({ operator: "contains" }), "bpm");
    expect(next.operator).toBe("is");
  });

  it("starts a draft on the first field and its first operator", () => {
    expect(emptyDraft(VOCABULARY)).toMatchObject({ field: "genre", operator: "is" });
  });

  it("starts empty when the vocabulary has not arrived", () => {
    expect(emptyDraft(null)).toMatchObject({ field: "", operator: "" });
  });
});

describe("building a clause", () => {
  it("builds a text clause", () => {
    const built = buildRule(VOCABULARY, draft({ value: " House " }));
    expect(built).toEqual({
      ok: true,
      rule: { field: "genre", operator: "is", value: "House" },
    });
  });

  it("builds a number clause", () => {
    const built = buildRule(
      VOCABULARY,
      draft({ field: "bpm", operator: "gte", value: "128" }),
    );
    expect(built).toEqual({
      ok: true,
      rule: { field: "bpm", operator: "gte", value: 128 },
    });
  });

  it("builds a range", () => {
    const built = buildRule(
      VOCABULARY,
      draft({ field: "bpm", operator: "between", value: "120", secondValue: "128" }),
    );
    expect(built).toEqual({
      ok: true,
      rule: { field: "bpm", operator: "between", value: [120, 128] },
    });
  });

  it("builds a date range without turning it into numbers", () => {
    const built = buildRule(
      VOCABULARY,
      draft({
        field: "date_added",
        operator: "between",
        value: "2019-01-01",
        secondValue: "2020-01-01",
      }),
    );
    expect(built).toEqual({
      ok: true,
      rule: {
        field: "date_added",
        operator: "between",
        value: ["2019-01-01", "2020-01-01"],
      },
    });
  });

  it("builds a list from a comma-separated value", () => {
    const built = buildRule(
      VOCABULARY,
      draft({ operator: "any_of", value: "House, Techno , Minimal" }),
    );
    expect(built).toEqual({
      ok: true,
      rule: { field: "genre", operator: "any_of", value: ["House", "Techno", "Minimal"] },
    });
  });

  it("builds a list of numbers for a number field", () => {
    const built = buildRule(
      VOCABULARY,
      draft({ field: "rating", operator: "any_of", value: "4,5" }),
    );
    expect(built).toEqual({
      ok: true,
      rule: { field: "rating", operator: "any_of", value: [4, 5] },
    });
  });

  it("builds a valueless clause with no value", () => {
    const built = buildRule(VOCABULARY, draft({ operator: "is_empty", value: "x" }));
    expect(built).toEqual({
      ok: true,
      rule: { field: "genre", operator: "is_empty" },
    });
  });
});

describe("a clause that cannot be built", () => {
  it("says so when a value is missing", () => {
    expect(buildRule(VOCABULARY, draft({ value: "" }))).toEqual({
      ok: false,
      reason: "Give a value for Genre",
    });
  });

  it("says so when only one end of a range is given", () => {
    const built = buildRule(
      VOCABULARY,
      draft({ field: "bpm", operator: "between", value: "120" }),
    );
    expect(built).toEqual({ ok: false, reason: "Give both ends of the range" });
  });

  it("says so when a number field is given words", () => {
    const built = buildRule(
      VOCABULARY,
      draft({ field: "bpm", operator: "gte", value: "fast" }),
    );
    expect(built).toEqual({ ok: false, reason: "BPM takes numbers" });
  });

  it("says so when a list of numbers has a word in it", () => {
    const built = buildRule(
      VOCABULARY,
      draft({ field: "rating", operator: "any_of", value: "4, great" }),
    );
    expect(built).toEqual({ ok: false, reason: "Rating takes numbers" });
  });

  it("says so when a list is empty", () => {
    const built = buildRule(VOCABULARY, draft({ operator: "any_of", value: " , " }));
    expect(built).toEqual({ ok: false, reason: "Give at least one value" });
  });

  it("refuses an operator the field does not allow", () => {
    const built = buildRule(VOCABULARY, draft({ operator: "gte", value: "1" }));
    expect(built).toEqual({ ok: false, reason: "Genre cannot be filtered that way" });
  });

  it("refuses a field the engine has never heard of", () => {
    const built = buildRule(VOCABULARY, draft({ field: "vibe", value: "dark" }));
    expect(built).toEqual({ ok: false, reason: "Choose a field" });
  });
});

describe("reading a clause back", () => {
  it("reads a text clause", () => {
    expect(
      describeRule(VOCABULARY, { field: "genre", operator: "is", value: "House" }),
    ).toBe("Genre is House");
  });

  it("reads a range", () => {
    expect(
      describeRule(VOCABULARY, {
        field: "bpm",
        operator: "between",
        value: [120, 128],
      }),
    ).toBe("BPM is between 120 and 128");
  });

  it("reads a list", () => {
    expect(
      describeRule(VOCABULARY, {
        field: "genre",
        operator: "any_of",
        value: ["House", "Techno"],
      }),
    ).toBe("Genre is any of House, Techno");
  });

  it("reads a valueless clause without inventing a value", () => {
    expect(describeRule(VOCABULARY, { field: "genre", operator: "is_empty" })).toBe(
      "Genre is empty",
    );
  });

  it("reads a rating as stars", () => {
    // The model stores 0-5 already; the parser converted Rekordbox's encoding
    // at import, so there is no second mapping here.
    expect(
      describeRule(VOCABULARY, { field: "rating", operator: "is", value: 4 }),
    ).toBe("Rating is ★★★★");
  });

  it("calls a zero rating unrated rather than showing no stars", () => {
    expect(starsFor(0)).toBe("unrated");
    expect(starsFor(5)).toBe("★★★★★");
  });

  it("falls back to the identifier for a field it does not know", () => {
    expect(describeRule(null, { field: "genre", operator: "is", value: "House" })).toBe(
      "genre is House",
    );
  });

  it("has words for every operator it offers", () => {
    // An operator with no entry falls through to its identifier, and
    // "not_contains" is not something to show a user.
    for (const operator of Object.keys(VOCABULARY.operators)) {
      expect(operatorLabel(operator)).not.toContain("_");
      expect(operatorLabel(operator).length).toBeGreaterThan(0);
    }
    expect(operatorLabel("not_contains")).toBe("does not contain");
    expect(operatorLabel("gte")).toBe("is at least");
  });
});

describe("the rule set", () => {
  const houseRule = { field: "genre", operator: "is", value: "House" };
  const bpmRule = { field: "bpm", operator: "gte", value: 128 };

  it("adds a clause", () => {
    expect(addRule(null, houseRule)).toEqual({ match: "all", rules: [houseRule] });
  });

  it("keeps the clauses already there", () => {
    const one: FilterRuleSet = { match: "all", rules: [houseRule] };
    expect(addRule(one, bpmRule).rules).toEqual([houseRule, bpmRule]);
  });

  it("stays flat and AND-only (DEC-016)", () => {
    expect(addRule(null, houseRule).match).toBe("all");
  });

  it("removes one clause and leaves the others", () => {
    const two: FilterRuleSet = { match: "all", rules: [houseRule, bpmRule] };
    expect(removeRule(two, 0)?.rules).toEqual([bpmRule]);
  });

  it("becomes nothing once the last clause is removed", () => {
    const one: FilterRuleSet = { match: "all", rules: [houseRule] };
    expect(removeRule(one, 0)).toBeNull();
  });

  it("counts what is active", () => {
    expect(ruleCount(null)).toBe(0);
    expect(ruleCount({ match: "all", rules: [houseRule, bpmRule] })).toBe(2);
  });
});
