import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateRss } from "./check-feed.mjs";

const item = () =>
  `<item><title>Hello</title><link>https://usecuepoint.com/blog/hello/</link><guid isPermaLink="true">https://usecuepoint.com/blog/hello/</guid><pubDate>Mon, 05 Oct 2026 00:00:00 GMT</pubDate></item>`;
const HEAD = "<title>CuePoint blog</title><link>https://usecuepoint.com/blog/</link><description>News</description>";
const feed = (items = item(), head = HEAD, v = "2.0") =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="${v}"><channel>${head}${items}</channel></rss>`;

describe("validateRss", () => {
  it("accepts a valid RSS 2.0 feed, with or without items", () => {
    expect(validateRss(feed())).toEqual([]);
    expect(validateRss(feed(""))).toEqual([]);
  });
  it("rejects the wrong version, a missing channel field and a bad item", () => {
    expect(validateRss(feed(item(), HEAD, "1.0")).join()).toMatch(/version/);
    expect(validateRss(feed(item(), "<title>x</title>")).join()).toMatch(/link/);
    expect(validateRss(feed("<item><title>x</title></item>")).join()).toMatch(/pubDate/);
    expect(validateRss(feed(item().replace("Mon, 05 Oct 2026", "yesterday"))).join()).toMatch(/pubDate/);
  });
  it("rejects text that is not RSS", () => {
    expect(validateRss("<html></html>").join()).toMatch(/rss/);
  });
});

// The built feed, when a build exists (`npm run check:site` always checks it).
const BUILT = join(import.meta.dirname, "..", "dist", "blog", "rss.xml");
describe.skipIf(!existsSync(BUILT))("the built feed", () => {
  it("is valid RSS 2.0", () => {
    expect(validateRss(readFileSync(BUILT, "utf8"))).toEqual([]);
  });
});
