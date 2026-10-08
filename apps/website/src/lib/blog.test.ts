import { describe, expect, it } from "vitest";
import { readingMinutes, relatedLinks, shareLinks, visiblePosts, type PostSummary } from "./blog";

const post = (slug: string, date: string, tags: string[], draft = false): PostSummary => ({
  slug,
  title: `Post ${slug}`,
  date: new Date(date),
  tags,
  draft,
});

describe("readingMinutes", () => {
  it("is at least one minute and counts about 200 words a minute", () => {
    expect(readingMinutes("")).toBe(1);
    expect(readingMinutes("word ".repeat(200))).toBe(1);
    expect(readingMinutes("word ".repeat(201))).toBe(2);
    expect(readingMinutes("word ".repeat(1000))).toBe(5);
  });
  it("ignores Markdown link addresses and code fences", () => {
    expect(readingMinutes(`[one](${"x".repeat(5000)}) \`\`\`\n${"code ".repeat(1000)}\n\`\`\``)).toBe(1);
  });
});

describe("visiblePosts", () => {
  const posts = [post("a", "2026-01-01", []), post("b", "2026-03-01", [], true), post("c", "2026-02-01", [])];
  it("drops drafts in a public build and sorts newest first", () => {
    expect(visiblePosts(posts, { preview: false }).map((p) => p.slug)).toEqual(["c", "a"]);
  });
  it("keeps drafts in a preview build", () => {
    expect(visiblePosts(posts, { preview: true }).map((p) => p.slug)).toEqual(["b", "c", "a"]);
  });
});

describe("shareLinks", () => {
  const links = shareLinks("https://usecuepoint.com/blog/hello/", "Hello & welcome");
  it("builds plain https links for X, Bluesky and Reddit", () => {
    expect(links.map((l) => l.label)).toEqual(["X", "Bluesky", "Reddit"]);
    for (const l of links) expect(l.href).toMatch(/^https:\/\//);
    expect(links[0]?.href).toContain("url=https%3A%2F%2Fusecuepoint.com%2Fblog%2Fhello%2F");
    expect(links[0]?.href).toContain("text=Hello%20%26%20welcome");
    expect(links[1]?.href).toContain("https%3A%2F%2Fusecuepoint.com%2Fblog%2Fhello%2F");
  });
});

describe("relatedLinks", () => {
  const nav = [
    { label: "Home", path: "" },
    { label: "Changelog", path: "changelog/" },
    { label: "Guide", path: "guide/" },
  ];
  it("prefers other posts, those sharing a tag first", () => {
    const all = [post("a", "2026-03-01", ["x"]), post("b", "2026-02-01", ["y"]), post("c", "2026-01-01", ["x"])];
    const links = relatedLinks(all[0]!, all, nav);
    expect(links.map((l) => l.path)).toEqual(["blog/c/", "blog/b/"]);
  });
  it("falls back to site pages when there are fewer than two other posts", () => {
    const only = post("a", "2026-03-01", []);
    expect(relatedLinks(only, [only], nav).map((l) => l.path)).toEqual(["guide/", "changelog/"]);
    const two = [only, post("b", "2026-02-01", [])];
    expect(relatedLinks(only, two, nav).map((l) => l.path)).toEqual(["blog/b/", "guide/"]);
  });
  it("only links pages that exist in the nav", () => {
    const only = post("a", "2026-03-01", []);
    expect(relatedLinks(only, [only], [{ label: "Home", path: "" }])).toEqual([]);
  });
});
