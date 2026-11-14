import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { legacyAppcast } from "./legacy-appcast";
import type { ReleaseData } from "./releases";

const file = (name: string, system: "windows" | "macos" | "linux", chip: "x64" | "arm64", n: string) => ({
  name,
  system,
  chip,
  size: 1000 + n.length,
  sha256: n.repeat(64),
  url: `https://github.com/stuchain/CuePoint/releases/download/v1.0.3/${name}`,
});

const RELEASE: ReleaseData = {
  release: {
    version: "1.0.3",
    tag: "v1.0.3",
    publishedAt: "2026-11-12T17:17:30Z",
    notesUrl: "https://github.com/stuchain/CuePoint/releases/tag/v1.0.3",
  },
  files: [
    file("CuePoint-1.0.3-win-x64-setup.exe", "windows", "x64", "a"),
    file("CuePoint-1.0.3-mac-arm64.dmg", "macos", "arm64", "b"),
    file("CuePoint-1.0.3-mac-x64.dmg", "macos", "x64", "c"),
    file("CuePoint-1.0.3-linux-x86_64.AppImage", "linux", "x64", "d"),
  ],
  downloads: 55,
  fetchedAt: "2026-11-14T00:00:00.000Z",
};

// Read the way the old app reads it: namespaced names kept, attributes kept.
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });

function items(xml: string): Record<string, unknown>[] {
  const channel = parser.parse(xml).rss.channel;
  const item = channel.item;
  return item === undefined ? [] : Array.isArray(item) ? item : [item];
}

describe("the retired app's update feed", () => {
  it("offers the Windows setup with its size and checksum", () => {
    const [item] = items(legacyAppcast(RELEASE, "windows"));
    if (!item) throw new Error("no item");
    expect(item["sparkle:shortVersionString"]).toBe("1.0.3");
    expect(item["sparkle:version"]).toBe("1.0.3");
    const enclosure = item["enclosure"] as Record<string, string>;
    expect(enclosure["@url"]).toBe("https://github.com/stuchain/CuePoint/releases/download/v1.0.3/CuePoint-1.0.3-win-x64-setup.exe");
    expect(enclosure["@length"]).toBe("1001");
    expect(enclosure["@sparkle:sha256"]).toBe("a".repeat(64));
    expect(item["sparkle:releaseNotesLink"]).toBe("https://github.com/stuchain/CuePoint/releases/tag/v1.0.3");
  });

  it("offers old Mac copies nothing, so they stop showing the error but keep their app", () => {
    expect(items(legacyAppcast(RELEASE, "macos"))).toEqual([]);
    expect(parser.parse(legacyAppcast(RELEASE, "macos")).rss.channel.title).toBe("CuePoint Updates");
  });

  it("uses the sparkle namespace the old app looks names up in", () => {
    expect(legacyAppcast(RELEASE, "windows")).toContain('xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"');
  });

  it("dates the item the RFC 822 way", () => {
    expect(legacyAppcast(RELEASE, "windows")).toContain("<pubDate>Thu, 12 Nov 2026 17:17:30 +0000</pubDate>");
  });

  it("has no item, so no update, before a normal release exists", () => {
    const none: ReleaseData = { release: null, files: [], downloads: null, fetchedAt: RELEASE.fetchedAt };
    expect(items(legacyAppcast(none, "windows"))).toEqual([]);
    expect(items(legacyAppcast(none, "macos"))).toEqual([]);
  });

  it("has no item when the release has no Windows setup", () => {
    const noWindows = { ...RELEASE, files: RELEASE.files.filter((f) => f.system !== "windows") };
    expect(items(legacyAppcast(noWindows, "windows"))).toEqual([]);
  });

  it("escapes text that would break the XML", () => {
    const odd = { ...RELEASE, release: { ...RELEASE.release!, notesUrl: "https://example.com/?a=1&b=<2>" } };
    expect(() => parser.parse(legacyAppcast(odd, "windows"))).not.toThrow();
    expect(legacyAppcast(odd, "windows")).toContain("a=1&amp;b=&lt;2&gt;");
  });
});
