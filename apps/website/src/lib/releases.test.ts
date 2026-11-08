import { describe, expect, it } from "vitest";
import { downloadsText, parseReleaseData } from "./releases";

const NONE = { release: null, files: [], fetchedAt: "2026-11-02T00:00:00.000Z" };

describe("downloads in the release data", () => {
  it("reads a whole-number count", () => {
    expect(parseReleaseData({ ...NONE, downloads: 55 }).downloads).toBe(55);
  });

  it("is null in data written before the count existed", () => {
    expect(parseReleaseData(NONE).downloads).toBeNull();
  });

  it.each([-1, 1.5, "55"])("refuses %s", (downloads) => {
    expect(() => parseReleaseData({ ...NONE, downloads })).toThrow(/downloads/);
  });
});

describe("downloadsText", () => {
  it.each([
    [0, "Downloaded 0 times"],
    [1, "Downloaded 1 time"],
    [55, "Downloaded 55 times"],
    [1240, "Downloaded 1,240 times"],
  ])("says %i as %s", (downloads, text) => {
    expect(downloadsText({ ...NONE, downloads })).toBe(text);
  });

  it("says nothing without a count", () => {
    expect(downloadsText({ ...NONE, downloads: null })).toBeNull();
  });

  it("picks the wording by the language's own plural rule, and falls back to other for a category it lacks", () => {
    const words = { one: "{count} vez", other: "{count} vezes" };
    // pt: 0 and 1 are "one" in CLDR; English would say 0 is "other"
    expect(downloadsText({ ...NONE, downloads: 0 }, words, "pt-BR")).toBe("0 vez");
    expect(downloadsText({ ...NONE, downloads: 0 }, words, "en-US")).toBe("0 vezes");
    // Polish has few and many: with only one/other given, they fall back to other
    expect(downloadsText({ ...NONE, downloads: 3 }, words, "pl")).toBe("3 vezes");
    expect(downloadsText({ ...NONE, downloads: 3 }, { ...words, few: "{count} razy" }, "pl")).toBe("3 razy");
  });
});
