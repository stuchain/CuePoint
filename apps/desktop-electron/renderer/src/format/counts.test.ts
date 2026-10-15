import { describe, expect, it } from "vitest";
import { formatCount, plural, pluralWord } from "./counts";

describe("counts", () => {
  it("groups digits by locale", () => {
    expect(formatCount(1234, "en-US")).toBe("1,234");
    expect(formatCount(1234, "de-DE")).toBe("1.234");
  });
  it("pluralizes", () => {
    expect(plural(1, "track", undefined, "en-US")).toBe("1 track");
    expect(plural(2, "track", undefined, "en-US")).toBe("2 tracks");
    expect(plural(0, "track", undefined, "en-US")).toBe("0 tracks");
    expect(plural(1234, "entry", "entries", "en-US")).toBe("1,234 entries");
    expect(pluralWord(1, "entry", "entries")).toBe("entry");
  });
});
