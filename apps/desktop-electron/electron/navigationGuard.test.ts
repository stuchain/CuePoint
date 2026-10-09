/**
 * The window never leaves the app's own page (DIST-07 review): a link in untrusted release
 * notes, or anything else, must not load another site into the window that holds the preload.
 */
import { describe, expect, it } from "vitest";

import { isOwnPage } from "./navigationGuard";

const INDEX = "file:///opt/CuePoint/resources/app/renderer/dist/index.html";

describe("isOwnPage, packaged", () => {
  const own = { devUrl: null, indexUrl: INDEX };

  it.each([INDEX, `${INDEX}#/library`, `${INDEX}?x=1#/settings`])("allows the app's own page: %s", (url) => {
    expect(isOwnPage(url, own)).toBe(true);
  });

  it.each([
    "https://github.com/stuchain/CuePoint",
    "https://evil.test/",
    "http://localhost:5173/",
    "file:///etc/passwd",
    "file:///opt/CuePoint/resources/app/renderer/dist/other.html",
    "javascript:alert(1)",
    "data:text/html,hi",
    "not a url",
    "",
  ])("refuses %s", (url) => {
    expect(isOwnPage(url, own)).toBe(false);
  });

  it.each([null, undefined, 3, {}])("refuses what is not text: %j", (value) => {
    expect(isOwnPage(value, own)).toBe(false);
  });
});

describe("isOwnPage, development", () => {
  const own = { devUrl: "http://localhost:5173", indexUrl: INDEX };

  it.each(["http://localhost:5173/", "http://localhost:5173/#/library", "http://localhost:5173/src/main.tsx"])(
    "allows the dev server: %s",
    (url) => {
      expect(isOwnPage(url, own)).toBe(true);
    },
  );

  it.each(["http://localhost:5174/", "https://localhost:5173/", "http://localhost.evil.test:5173/", "https://github.com/"])(
    "refuses %s",
    (url) => {
      expect(isOwnPage(url, own)).toBe(false);
    },
  );
});
