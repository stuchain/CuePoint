import { describe, expect, it } from "vitest";
import { extensionMatchesFileName, expectedDropLabel } from "./fileDropUtils";

describe("fileDropUtils", () => {
  it("matches xml and m3u extensions", () => {
    expect(extensionMatchesFileName("collection.xml", "xml")).toBe(true);
    expect(extensionMatchesFileName("set.XML", "xml")).toBe(true);
    expect(extensionMatchesFileName("set.m3u", "m3u")).toBe(true);
    expect(extensionMatchesFileName("set.m3u8", "m3u")).toBe(true);
    expect(extensionMatchesFileName("set.txt", "xml")).toBe(false);
    expect(extensionMatchesFileName("set.txt", "m3u")).toBe(false);
  });

  it("labels expected drop kinds", () => {
    expect(expectedDropLabel("xml")).toBe("XML");
    expect(expectedDropLabel("m3u")).toBe("M3U/M3U8");
  });
});
