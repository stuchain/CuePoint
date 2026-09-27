/**
 * What "Open on Beatport" may open (DISCOVER-10): an https page on Beatport's
 * website and nothing else, whatever the renderer sends.
 */
import { describe, expect, it } from "vitest";

import { MAX_URL_LENGTH, beatportPageUrl } from "./externalLinks";

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
