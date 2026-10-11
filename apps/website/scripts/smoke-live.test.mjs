import { describe, expect, it } from "vitest";
import { smokeProblems } from "./smoke-live.mjs";

const siteUrl = "https://usecuepoint.com/";
const home = `<html><head><link rel="canonical" href="${siteUrl}"></head></html>`;
const robots = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap-index.xml\n`;
const sitemap = '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>';

describe("smoke-live (SITE-13)", () => {
  it("passes a live public site", () => {
    expect(smokeProblems({ siteUrl, home, robots, sitemap })).toEqual([]);
  });
  it("fails a canonical at another address", () => {
    const other = home.replace(siteUrl, "https://stuchain.github.io/CuePoint/");
    expect(smokeProblems({ siteUrl, home: other, robots, sitemap })).toEqual([expect.stringContaining("canonical")]);
  });
  it("fails a preview build: noindex on the home, or robots.txt keeping crawlers out", () => {
    const noindex = home.replace("</head>", '<meta name="robots" content="noindex, nofollow"></head>');
    expect(smokeProblems({ siteUrl, home: noindex, robots, sitemap })).toEqual([expect.stringContaining("noindex")]);
    const shut = robots.replace("Allow: /", "Disallow: /");
    expect(smokeProblems({ siteUrl, home, robots: shut, sitemap })).toEqual([expect.stringContaining("stay out")]);
  });
  it("fails a robots.txt without the sitemap and a sitemap that is not one", () => {
    expect(smokeProblems({ siteUrl, home, robots: "User-agent: *\nAllow: /\n", sitemap: "<html></html>" })).toHaveLength(2);
  });
});
