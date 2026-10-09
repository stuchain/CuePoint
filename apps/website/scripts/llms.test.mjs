import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildLlmsTxt, isIndexableFile, readPages, shortTitle, writeLlmsTxt } from "./llms.mjs";

const SITE = "https://example.test/";
const made = [];
afterAll(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true });
});

function build(files) {
  const dir = mkdtempSync(join(tmpdir(), "llms-"));
  made.push(dir);
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), body);
  }
  return dir;
}
const page = (path, title, description, main = "") =>
  `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${SITE}${path}"></head><body><main>${main}</main></body></html>`;

describe("llms.txt", () => {
  it("lists the pages a search engine may index, and not the 404, thank-you or style guide pages", () => {
    expect(isIndexableFile("index.html")).toBe(true);
    expect(isIndexableFile("guide/clean/index.html")).toBe(true);
    for (const f of ["404.html", "contact/thank-you/index.html", "styleguide/index.html", "styleguide/three/a/index.html"]) {
      expect(isIndexableFile(f), f).toBe(false);
    }
  });

  it("drops the site's suffix from a title", () => {
    expect(shortTitle("Getting started | CuePoint guide")).toBe("Getting started");
    expect(shortTitle("FAQ | CuePoint")).toBe("FAQ");
    expect(shortTitle("Download CuePoint")).toBe("Download CuePoint");
  });

  it("writes a title, the home page's summary and one line per page, in sections, in the site's own order", () => {
    const dist = build({
      "index.html": page("", "CuePoint", "A free app for DJs.", `<a href="/features/">F</a><a href="/guide/">G</a>`),
      "features/index.html": page("features/", "Features", "What it does.", `<a href="/features/keys/">K</a><a href="/features/clean/">C</a>`),
      "features/clean/index.html": page("features/clean/", "Clean", "Fix tags."),
      "features/keys/index.html": page("features/keys/", "Keys", "The wheel."),
      "guide/index.html": page("guide/", "CuePoint user guide", "The guide.", `<a href="/guide/b/">B</a><a href="/guide/a/">A</a>`),
      "guide/a/index.html": page("guide/a/", "A page | CuePoint guide", "About A."),
      "guide/b/index.html": page("guide/b/", "B page | CuePoint guide", "About B."),
      "faq/index.html": page("faq/", "FAQ | CuePoint", "Answers."),
      "privacy/index.html": page("privacy/", "Privacy policy", "What is kept."),
      "404.html": page("404.html", "Not found", "Lost."),
      "contact/thank-you/index.html": page("contact/thank-you/", "Message sent", "Thanks."),
    });
    const text = buildLlmsTxt(readPages(dist), { siteName: "CuePoint", siteUrl: SITE });
    expect(text.startsWith("# CuePoint\n\n> A free app for DJs.\n")).toBe(true);
    const sections = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(sections).toEqual(["Product", "User guide", "Help", "Optional"]);
    // the home page's and the overview's order, not the alphabet
    expect(text.indexOf("[Keys]")).toBeLessThan(text.indexOf("[Clean]"));
    expect(text.indexOf("[B page]")).toBeLessThan(text.indexOf("[A page]"));
    expect(text).toContain(`- [Clean](${SITE}features/clean/): Fix tags.`);
    expect(text).not.toContain("Not found");
    expect(text).not.toContain("Message sent");
    expect(writeLlmsTxt(dist, { siteName: "CuePoint", siteUrl: SITE })).toBe(9);
    expect(readFileSync(join(dist, "llms.txt"), "utf8")).toBe(text);
  });
});
