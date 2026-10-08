import { describe, expect, it } from "vitest";

import type { FilterRuleSet } from "../../api/cuepointBridge.types";
import { openSource, withSource } from "./savedScope";

const key: FilterRuleSet = {
  match: "all",
  rules: [{ field: "key", operator: "is", value: "8A" }],
};

describe("openSource", () => {
  it("is the open playlist, Collection or Set, else nothing", () => {
    expect(openSource(4, null)).toEqual({ kind: "playlist", id: 4 });
    expect(openSource(null, { id: 9, kind: "collection" })).toEqual({
      kind: "collection",
      id: 9,
    });
    expect(openSource(null, { id: 11, kind: "set" })).toEqual({ kind: "set", id: 11 });
    expect(openSource(null, null)).toBeNull();
  });
});

describe("withSource", () => {
  it("adds 'In playlist is any of' to what is saved, after the other rules", () => {
    expect(withSource(key, { kind: "playlist", id: 4 })).toEqual({
      match: "all",
      rules: [
        { field: "key", operator: "is", value: "8A" },
        { field: "in_playlist", operator: "any_of", value: [{ kind: "playlist", id: 4 }] },
      ],
    });
  });

  it("leaves the rules alone when no place is open", () => {
    expect(withSource(key, null)).toBe(key);
  });

  it("joins the place to an In playlist rule already there, once", () => {
    const there: FilterRuleSet = {
      match: "all",
      rules: [
        { field: "in_playlist", operator: "any_of", value: [{ kind: "collection", id: 9 }] },
      ],
    };
    const joined = withSource(there, { kind: "playlist", id: 4 });
    expect(joined?.rules).toHaveLength(1);
    expect(joined?.rules[0]?.value).toEqual([
      { kind: "collection", id: 9 },
      { kind: "playlist", id: 4 },
    ]);
    expect(withSource(joined, { kind: "playlist", id: 4 })).toBe(joined);
  });
});
