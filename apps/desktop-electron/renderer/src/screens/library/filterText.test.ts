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
  buildableFields,
  describeRule,
  emptyDraft,
  fieldOf,
  operatorLabel,
  isStars,
  operatorsFor,
  removeRule,
  ruleCount,
  selectedIds,
  starsFor,
  toggleId,
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
      unit: null,
      integer: false,
      operators: ["is", "contains", "any_of", "is_empty"],
    },
    {
      name: "bpm",
      type: "number",
      label: "BPM",
      facetable: false,
      unit: null,
      integer: false,
      operators: ["is", "gte", "between", "is_empty"],
    },
    {
      name: "rating",
      type: "number",
      label: "Rating",
      facetable: true,
      unit: "stars",
      integer: true,
      operators: ["is", "gte", "any_of", "is_empty"],
    },
    {
      name: "date_added",
      type: "date",
      label: "Date added",
      facetable: false,
      unit: null,
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

/** The whole vocabulary, CuePoint's own three kinds included (ORG-05). */
const WITH_ORGANIZATION_FIELDS: LibraryFilterVocabulary = {
  ...VOCABULARY,
  operators: {
    ...VOCABULARY.operators,
    has_tag: { arity: "single" },
    not_has_tag: { arity: "single" },
    in_collection: { arity: "single" },
    not_in_collection: { arity: "single" },
  },
  fields: [
    ...VOCABULARY.fields,
    {
      name: "favorite",
      type: "bool",
      label: "Favorite",
      facetable: true,
      unit: null,
      integer: false,
      operators: ["is"],
    },
    {
      name: "tag",
      type: "tag",
      label: "Tag",
      facetable: true,
      unit: null,
      integer: false,
      operators: ["has_tag", "not_has_tag", "any_of", "is_empty"],
    },
    {
      name: "collection",
      type: "collection",
      label: "Collection",
      facetable: false,
      unit: null,
      integer: false,
      operators: ["in_collection", "not_in_collection"],
    },
  ],
};

describe("buildableFields", () => {
  /**
   * The acceptance criterion for ORG-12, as one assertion: no field the engine
   * offers is missing from the bar. ORG-05 taught the engine to filter by tag,
   * by Collection membership and by favorite and the bar had controls for none
   * of them, so `buildableFields` dropped the three — which was honest then
   * and would be a feature nobody can reach now.
   */
  it("offers every field the engine describes", () => {
    expect(buildableFields(WITH_ORGANIZATION_FIELDS).map((f) => f.name)).toEqual(
      WITH_ORGANIZATION_FIELDS.fields.map((f) => f.name),
    );
  });

  it("drops none of CuePoint's own kinds", () => {
    const names = buildableFields(WITH_ORGANIZATION_FIELDS).map((f) => f.name);
    expect(names).toContain("tag");
    expect(names).toContain("collection");
    expect(names).toContain("favorite");
  });

  it("keeps the engine's order", () => {
    expect(buildableFields(VOCABULARY).map((f) => f.name)).toEqual(
      VOCABULARY.fields.map((f) => f.name),
    );
  });

  it("is empty without a vocabulary", () => {
    expect(buildableFields(null)).toEqual([]);
  });

  it("starts a draft on the first field, whatever kind it is", () => {
    const vocabulary: LibraryFilterVocabulary = {
      ...WITH_ORGANIZATION_FIELDS,
      fields: [WITH_ORGANIZATION_FIELDS.fields[4], ...VOCABULARY.fields],
    };
    expect(emptyDraft(vocabulary).field).toBe("favorite");
  });

  it("leaves a draft empty when the vocabulary has no fields at all", () => {
    expect(emptyDraft({ ...VOCABULARY, fields: [] }).field).toBe("");
  });
});

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

describe("CuePoint's own field kinds (ORG-12)", () => {
  const V = WITH_ORGANIZATION_FIELDS;

  describe("a favorite is yes or no", () => {
    it("builds a true clause from the word, not the string", () => {
      expect(
        buildRule(V, draft({ field: "favorite", operator: "is", value: "true" })),
      ).toEqual({ ok: true, rule: { field: "favorite", operator: "is", value: true } });
    });

    it("builds a false clause, which is a question and not an absence", () => {
      // "favorite is false" is how a user asks for the tracks they have not
      // starred. Sending nothing, or sending the string "false", is a
      // different question and the engine would say so.
      expect(
        buildRule(V, draft({ field: "favorite", operator: "is", value: "false" })),
      ).toEqual({ ok: true, rule: { field: "favorite", operator: "is", value: false } });
    });

    it("refuses anything that is neither", () => {
      expect(
        buildRule(V, draft({ field: "favorite", operator: "is", value: "maybe" })),
      ).toEqual({ ok: false, reason: "Favorite is yes or no" });
    });

    it("reads back as a word rather than as a boolean", () => {
      expect(describeRule(V, { field: "favorite", operator: "is", value: true })).toBe(
        "Favorite is yes",
      );
      expect(describeRule(V, { field: "favorite", operator: "is", value: false })).toBe(
        "Favorite is no",
      );
    });
  });

  describe("a tag and a Collection are ids", () => {
    it("builds a tag clause from an id", () => {
      expect(
        buildRule(V, draft({ field: "tag", operator: "has_tag", value: "7" })),
      ).toEqual({ ok: true, rule: { field: "tag", operator: "has_tag", value: 7 } });
    });

    it("builds a list of tag ids as numbers, not as text", () => {
      expect(
        buildRule(V, draft({ field: "tag", operator: "any_of", value: "7, 9" })),
      ).toEqual({ ok: true, rule: { field: "tag", operator: "any_of", value: [7, 9] } });
    });

    it("builds a Collection clause from an id", () => {
      expect(
        buildRule(
          V,
          draft({ field: "collection", operator: "in_collection", value: "4" }),
        ),
      ).toEqual({
        ok: true,
        rule: { field: "collection", operator: "in_collection", value: 4 },
      });
    });

    it("refuses a name where an id belongs", () => {
      // The engine refuses it too. Saying so here is what stops a user from
      // watching a filter they typed empty the table for no visible reason.
      expect(
        buildRule(V, draft({ field: "tag", operator: "has_tag", value: "Peak-time" })),
      ).toEqual({ ok: false, reason: "Choose a tag" });
    });

    it("refuses a zero, a negative and a fraction", () => {
      for (const value of ["0", "-3", "2.5"]) {
        expect(buildRule(V, draft({ field: "tag", operator: "has_tag", value }))).toEqual({
          ok: false,
          reason: "Choose a tag",
        });
      }
    });

    it("reads back as the name behind the id", () => {
      expect(
        describeRule(
          V,
          { field: "tag", operator: "has_tag", value: 7 },
          { tag: new Map([[7, "Peak-time"]]) },
        ),
      ).toBe("Tag has Peak-time");
    });

    it("reads a list of ids as a list of names", () => {
      expect(
        describeRule(
          V,
          { field: "tag", operator: "any_of", value: [7, 9] },
          {
            tag: new Map([
              [7, "Peak-time"],
              [9, "Closer"],
            ]),
          },
        ),
      ).toBe("Tag is any of Peak-time, Closer");
    });

    it("says an id is gone rather than showing the number", () => {
      // A tag deleted after a Smart Collection saved a rule about it. The
      // number on screen would be meaningless; the rule is still what it is.
      expect(
        describeRule(
          V,
          { field: "tag", operator: "has_tag", value: 7 },
          { tag: new Map() },
        ),
      ).toBe("Tag has (no longer there)");
    });

    it("says nothing rather than 'deleted' before the names have loaded", () => {
      // The absence of a lookup and the absence of a row are different facts.
      // "No longer there" about a tag that is perfectly fine, for the second
      // before the vocabulary lands, is a lie somebody would act on.
      expect(describeRule(V, { field: "tag", operator: "has_tag", value: 7 })).toBe(
        "Tag has …",
      );
    });

    it("says the same about a Collection, from the Collection's names", () => {
      expect(
        describeRule(
          V,
          { field: "collection", operator: "not_in_collection", value: 4 },
          { collection: new Map([[4, "Closers"]]) },
        ),
      ).toBe("Collection is not in Closers");
    });

    it("does not read a Collection id out of the tag names", () => {
      expect(
        describeRule(
          V,
          { field: "collection", operator: "in_collection", value: 7 },
          { tag: new Map([[7, "Peak-time"]]), collection: new Map() },
        ),
      ).toBe("Collection is in (no longer there)");
    });

    it("has words for the membership operators", () => {
      expect(operatorLabel("has_tag")).toBe("has");
      expect(operatorLabel("not_has_tag")).toBe("does not have");
      expect(operatorLabel("in_collection")).toBe("is in");
      expect(operatorLabel("not_in_collection")).toBe("is not in");
    });
  });

  describe("what a field's numbers mean is the engine's to say", () => {
    it("calls a field stars because the engine called it stars", () => {
      expect(isStars(fieldOf(V, "rating"))).toBe(true);
      expect(isStars(fieldOf(V, "bpm"))).toBe(false);
    });

    it("reads every rating layer as stars, not just the one named `rating`", () => {
      // DEC-057's two layers plus the effective value. The bar holds no list
      // of their names; it asks the field list what they are.
      const layered: LibraryFilterVocabulary = {
        ...V,
        fields: [
          ...V.fields,
          {
            name: "cuepoint_rating",
            type: "number",
            label: "CuePoint rating",
            facetable: false,
            unit: "stars",
            integer: true,
            operators: ["is", "gte"],
          },
        ],
      };
      expect(
        describeRule(layered, { field: "cuepoint_rating", operator: "is", value: 3 }),
      ).toBe("CuePoint rating is ★★★");
    });

    it("leaves a unit it has never heard of as a plain number", () => {
      const odd: LibraryFilterVocabulary = {
        ...V,
        fields: [
          {
            name: "duration_seconds",
            type: "number",
            label: "Length",
            facetable: false,
            unit: "seconds",
            integer: true,
            operators: ["gte"],
          },
        ],
      };
      expect(
        describeRule(odd, { field: "duration_seconds", operator: "gte", value: 300 }),
      ).toBe("Length is at least 300");
    });
  });

  describe("switching fields", () => {
    it("drops a value that means nothing to the new field", () => {
      // "Deep House" typed against Genre is not a tag id, and carrying it
      // across would offer a clause that can only be refused.
      const moved = withField(V, draft({ field: "genre", value: "Deep House" }), "tag");
      expect(moved.value).toBe("");
    });

    it("keeps a value when the kind has not changed", () => {
      // BPM to Rating: still a number, so "4" still means something. Only a
      // change of kind makes what was typed meaningless.
      const moved = withField(V, draft({ field: "bpm", operator: "is", value: "4" }), "rating");
      expect(moved.value).toBe("4");
    });
  });

  describe("choosing ids by clicking", () => {
    it("holds one at a time for an operator that takes one", () => {
      const one = toggleId(draft({ field: "tag", value: "" }), 7, "single");
      expect(one.value).toBe("7");
      expect(toggleId(one, 9, "single").value).toBe("9");
    });

    it("lets go of the one already chosen", () => {
      expect(toggleId(draft({ field: "tag", value: "7" }), 7, "single").value).toBe("");
    });

    it("collects them for an operator that takes a list", () => {
      const one = toggleId(draft({ field: "tag", value: "" }), 7, "list");
      expect(toggleId(one, 9, "list").value).toBe("7,9");
    });

    it("takes one back out of a list and leaves the rest", () => {
      const two = draft({ field: "tag", value: "7,9" });
      expect(toggleId(two, 7, "list").value).toBe("9");
    });

    it("reads back what is chosen, ignoring what is not an id", () => {
      expect(selectedIds(draft({ value: "7, 9" }))).toEqual([7, 9]);
      expect(selectedIds(draft({ value: "" }))).toEqual([]);
      expect(selectedIds(draft({ value: "Peak-time" }))).toEqual([]);
    });
  });
});
