import { describe, expect, it } from "vitest";

import { camelotOf } from "./matchCard";

describe("the key in the app's notation", () => {
  it("turns Beatport's names into Camelot", () => {
    expect(camelotOf("A Minor")).toBe("8A");
    expect(camelotOf("B Major")).toBe("1B");
    expect(camelotOf("F# Minor")).toBe("11A");
    expect(camelotOf("Bb Major")).toBe("6B");
    expect(camelotOf("Eb Minor")).toBe("2A");
  });

  it("keeps a Camelot code and says nothing for no key", () => {
    expect(camelotOf("5a")).toBe("5A");
    expect(camelotOf(null)).toBeNull();
    expect(camelotOf("  ")).toBeNull();
  });

  it("shows a notation it does not know as it came", () => {
    expect(camelotOf("open key 3m")).toBe("open key 3m");
  });
});
