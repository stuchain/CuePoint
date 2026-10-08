/**
 * The quick filters' rule edits (FLW-4): each choice is an ordinary rule.
 */
import { describe, expect, it } from "vitest";

import type { FilterRuleSet } from "../../api/cuepointBridge.types";
import {
  applyRange,
  asksForNone,
  chosenRange,
  chosenValues,
  quickCount,
  toggleNone,
  toggleValue,
} from "./quickFilterRules";

const rules = (...list: FilterRuleSet["rules"]): FilterRuleSet => ({ match: "all", rules: list });

describe("toggling a value", () => {
  it("one value is an 'is' rule and a second makes it 'is any of', in one rule", () => {
    const one = toggleValue(null, "key", "8A");
    expect(one).toEqual(rules({ field: "key", operator: "is", value: "8A" }));
    const two = toggleValue(one, "key", "9A");
    expect(two).toEqual(rules({ field: "key", operator: "any_of", value: ["8A", "9A"] }));
  });

  it("unticking goes back down and the last one removes the rule", () => {
    const two = rules({ field: "key", operator: "any_of", value: ["8A", "9A"] });
    expect(toggleValue(two, "key", "8A")).toEqual(
      rules({ field: "key", operator: "is", value: "9A" }),
    );
    expect(toggleValue(toggleValue(two, "key", "8A"), "key", "9A")).toBeNull();
  });

  it("keeps the other rules and the chip's place", () => {
    const start = rules(
      { field: "key", operator: "is", value: "8A" },
      { field: "genre", operator: "is", value: "House" },
    );
    const next = toggleValue(start, "key", "9A");
    expect(next?.rules.map((rule) => rule.field)).toEqual(["key", "genre"]);
  });

  it("reads a chosen value back whatever its case", () => {
    const start = rules({ field: "genre", operator: "is", value: "house" });
    expect(chosenValues(start, "genre")).toEqual(["house"]);
    expect(toggleValue(start, "genre", "House")).toBeNull();
  });
});

describe("the tracks with no value", () => {
  it("is its own rule, and a chosen key takes it away", () => {
    const none = toggleNone(null, "key");
    expect(none).toEqual(rules({ field: "key", operator: "is_empty" }));
    expect(asksForNone(none, "key")).toBe(true);
    const keyed = toggleValue(none, "key", "8A");
    expect(keyed).toEqual(rules({ field: "key", operator: "is", value: "8A" }));
    expect(toggleNone(none, "key")).toBeNull();
  });
});

describe("a BPM range", () => {
  it("two ends are 'between', one end is at least or at most", () => {
    expect(applyRange(null, "bpm", 122, 126)?.rules).toEqual([
      { field: "bpm", operator: "between", value: [122, 126] },
    ]);
    expect(applyRange(null, "bpm", 122, null)?.rules[0]?.operator).toBe("gte");
    expect(applyRange(null, "bpm", null, 126)?.rules[0]?.operator).toBe("lte");
  });

  it("a backwards range is put right, and a new one replaces the old", () => {
    const first = applyRange(null, "bpm", 126, 122);
    expect(chosenRange(first, "bpm")).toEqual({ from: 122, to: 126 });
    const second = applyRange(first, "bpm", 100, 110);
    expect(second?.rules).toHaveLength(1);
    expect(chosenRange(second, "bpm")).toEqual({ from: 100, to: 110 });
  });

  it("blank ends remove the range", () => {
    expect(applyRange(applyRange(null, "bpm", 100, 110), "bpm", null, null)).toBeNull();
  });
});

describe("the count beside a button", () => {
  it("counts choices, and a range as one", () => {
    const set = rules(
      { field: "key", operator: "any_of", value: ["8A", "9A"] },
      { field: "bpm", operator: "between", value: [120, 126] },
    );
    expect(quickCount(set, "key")).toBe(2);
    expect(quickCount(set, "bpm")).toBe(1);
    expect(quickCount(set, "genre")).toBe(0);
  });
});
