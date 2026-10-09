/**
 * What "Open on Beatport" may open (DISCOVER-10): an https page on Beatport's
 * website and nothing else, whatever the renderer sends.
 */
import { describe, expect, it } from "vitest";

import { MAX_URL_LENGTH, beatportPageUrl, releaseNoteLinkUrl } from "./externalLinks";

describe("beatportPageUrl", () => {
  it.each([
    "https://www.beatport.com/track/night-drive/1000001",
    "https://www.beatport.com/chart/peak-picks/501",
    "https://www.beatport.com/library/playlists/9001",
    "https://beatport.com/track/t/7",
  ])("opens a Beatport page: %s", (url) => {
    expect(beatportPageUrl(url)).toBe(url);
  });

  it("normalizes what it opens", () => {
    expect(beatportPageUrl("https://WWW.Beatport.com/track/t/7")).toBe(
      "https://www.beatport.com/track/t/7",
    );
  });

  it.each([
    ["plain http", "http://www.beatport.com/track/t/7"],
    ["a file", "file:///C:/Windows/System32/calc.exe"],
    ["a custom protocol", "ms-settings:privacy"],
    ["javascript", "javascript:alert(1)"],
    ["another site", "https://example.com/track/t/7"],
    ["a look-alike host", "https://www.beatport.com.example.com/track/t/7"],
    ["a subdomain", "https://api.beatport.com/v4/catalog/tracks/7/"],
    ["credentials", "https://user:pass@www.beatport.com/track/t/7"],
    ["a port", "https://www.beatport.com:8443/track/t/7"],
    ["not a URL", "www.beatport.com/track/t/7"],
    ["empty", ""],
    ["too long", `https://www.beatport.com/${"a".repeat(MAX_URL_LENGTH)}`],
  ])("refuses %s", (_what, url) => {
    expect(beatportPageUrl(url)).toBeNull();
  });

  it.each([null, undefined, 7, {}, ["https://www.beatport.com/track/t/7"]])(
    "refuses what is not text: %j",
    (value) => {
      expect(beatportPageUrl(value)).toBeNull();
    },
  );
});

describe("releaseNoteLinkUrl", () => {
  it.each([
    "https://github.com/stevas/CuePoint/releases/tag/v1.0.1",
    "https://github.com/stevas/CuePoint/issues/12",
    "https://docs.github.com/en/pages",
    "https://usecuepoint.com/downloads",
    "https://www.usecuepoint.com/",
  ])("opens a link on GitHub or CuePoint's site: %s", (url) => {
    expect(releaseNoteLinkUrl(url)).toBe(url);
  });

  it("normalizes the host", () => {
    expect(releaseNoteLinkUrl("https://GitHub.com/a/b")).toBe("https://github.com/a/b");
  });

  it.each([
    ["plain http", "http://github.com/a/b"],
    ["a file", "file:///etc/passwd"],
    ["javascript", "javascript:alert(1)"],
    ["a custom protocol", "ms-settings:privacy"],
    ["another site", "https://example.com/a"],
    ["a look-alike suffix", "https://evilgithub.com/a"],
    ["a look-alike host", "https://github.com.example.com/a"],
    ["another site's subdomain of the name", "https://github.com.evil.io/a"],
    ["an unknown CuePoint host", "https://evil.usecuepoint.com/a"],
    ["credentials", "https://user:pass@github.com/a"],
    ["a port", "https://github.com:8443/a"],
    ["not a URL", "github.com/a"],
    ["empty", ""],
    ["too long", `https://github.com/${"a".repeat(MAX_URL_LENGTH)}`],
  ])("refuses %s", (_what, url) => {
    expect(releaseNoteLinkUrl(url)).toBeNull();
  });

  it.each([null, undefined, 7, {}])("refuses what is not text: %j", (value) => {
    expect(releaseNoteLinkUrl(value)).toBeNull();
  });
});
