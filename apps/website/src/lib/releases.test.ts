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
});
