import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_SHOTS, FEATURES } from "../data/home";
import { FEATURE_PAGES, OVERVIEW, featureHref, featureBySlug, shippedPages, unshippedMarkers } from "../data/features";
import { NAV } from "../data/nav";
import { DESCRIPTION_MAX, DESCRIPTION_MIN, GUIDE_ROWS } from "./guide";

const SITE = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const PLAN = readFileSync(resolve(SITE, "docs/content-plan.md"), "utf8");

/** The plan's table: | "query" | `page path` | ... | */
function planRows(): { query: string; path: string }[] {
  return PLAN.split("\n")
    .filter((l) => /^\|\s*"/.test(l))
    .map((l) => {
      const cells = l.split("|").map((c) => c.trim());
      return { query: cells[1]!.replace(/^"|"$/g, ""), path: cells[2]!.replace(/`/g, "") };
    });
}

const BANNED = /\b(engine|jobs?)\b/i;
const copyOf = (p: (typeof FEATURE_PAGES)[number]) => [
  p.name,
  p.title,
  p.description,
  p.heading,
  ...p.problem,
  ...p.how.flatMap((h) => [h.heading, ...h.paragraphs]),
  ...p.doesNot,
];

describe("the feature pages", () => {
  it("has a page for each thing the app does, in the spec's order", () => {
    expect(FEATURE_PAGES.map((p) => p.slug)).toEqual([
      "clean",
      "library",
      "keys",
      "discover",
      "prepare",
      "statistics",
      "waveforms",
      "export",
    ]);
  });

  it("gives every page one query, and no two pages the same query", () => {
    const rows = planRows();
    expect(rows.length).toBeGreaterThanOrEqual(FEATURE_PAGES.length);
    const queries = rows.map((r) => r.query.toLowerCase());
    expect(new Set(queries).size, "a query is listed twice").toBe(queries.length);
    for (const p of FEATURE_PAGES) {
      const row = rows.find((r) => r.path === featureHref(p.slug));
      expect(row, `${p.slug} is missing from docs/content-plan.md`).toBeDefined();
      expect(row!.query, p.slug).toBe(p.query);
    }
    expect(new Set(FEATURE_PAGES.map((p) => p.query.toLowerCase())).size).toBe(FEATURE_PAGES.length);
  });

  it("writes titles and descriptions within the checks' limits, each unique", () => {
    for (const p of FEATURE_PAGES) {
      expect(p.title.length, p.slug).toBeLessThanOrEqual(60);
      expect(p.description.length, p.slug).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
      expect(p.description.length, p.slug).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
    expect(new Set(FEATURE_PAGES.map((p) => p.title)).size).toBe(FEATURE_PAGES.length);
    expect(new Set(FEATURE_PAGES.map((p) => p.description)).size).toBe(FEATURE_PAGES.length);
  });

  it("links each page's guide page, which exists; only a page for an unshipped feature may have none", () => {
    const slugs = new Set(GUIDE_ROWS.map((r) => r.file.replace(/\.md$/, "")));
    for (const p of FEATURE_PAGES) {
      if (!p.guide) {
        expect(p.unshipped, `${p.slug} has no guide page and is not marked unshipped`).toBeDefined();
        continue;
      }
      expect(slugs.has(p.guide.page), `${p.slug} links guide/${p.guide.page}/`).toBe(true);
    }
    expect(FEATURE_PAGES.filter((p) => !p.guide).map((p) => p.slug)).toEqual(["keys"]);
  });

  it("marks what the app does not ship yet, with the step that ships it", () => {
    expect(unshippedMarkers()).toEqual([
      { where: "library: The Camelot wheel", step: "PAGES-10" },
      { where: "keys", step: "PAGES-16" },
    ]);
    for (const p of FEATURE_PAGES) {
      if (p.unshipped) expect(p.unshipped.shipped).toBe(false);
      for (const h of p.how) if (h.unshipped) expect(h.unshipped.shipped).toBe(false);
    }
  });

  it("never lets a shipped page or the overview claim an unshipped feature", () => {
    for (const p of shippedPages()) {
      for (const r of p.related) expect(featureBySlug(r)!.unshipped, `${p.slug} links ${r}`).toBeUndefined();
      const live = [
        p.title,
        p.description,
        p.heading,
        p.summary,
        ...p.problem,
        ...p.doesNot,
        ...p.how.filter((h) => !h.unshipped).flatMap((h) => [h.heading, ...h.paragraphs]),
      ];
      for (const line of live) expect(line, p.slug).not.toMatch(p.slug === "library" ? /\bwheel\b|Keys page|Statistics page/i : /Keys page|Statistics page/i);
    }
    expect(OVERVIEW.description).not.toMatch(/wheel|statistic|keys page/i);
    expect(OVERVIEW.description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
    expect(OVERVIEW.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("does not say CuePoint never listens to audio: it decodes it for waveforms and loudness", () => {
    for (const p of FEATURE_PAGES)
      for (const line of copyOf(p)) expect(line, p.slug).not.toMatch(/listen|detect\w* keys? from audio|does not analy[sz]e (the )?audio/i);
  });

  it("links two related pages, never itself, each distinct", () => {
    for (const p of FEATURE_PAGES) {
      expect(p.related, p.slug).toHaveLength(2);
      expect(new Set(p.related).size).toBe(2);
      for (const r of p.related) {
        expect(r).not.toBe(p.slug);
        expect(featureBySlug(r), `${p.slug} relates to ${r}`).toBeDefined();
      }
    }
  });

  it("says what the feature does not do, in at least two lines", () => {
    for (const p of FEATURE_PAGES) expect(p.doesNot.length, p.slug).toBeGreaterThanOrEqual(2);
  });

  it("keeps the words the site never uses out, and writes American English", () => {
    for (const p of FEATURE_PAGES)
      for (const line of copyOf(p)) {
        expect(line, p.slug).not.toMatch(BANNED);
        expect(line, p.slug).not.toMatch(/\b(colour|organis|catalogue|favourite|grey)/i);
      }
  });

  it("has an app picture slot for each page", () => {
    for (const p of FEATURE_PAGES) expect(APP_SHOTS[p.shot], p.slug).toBeDefined();
  });

  it("marks the lines the user guide does not cover yet with the decisions they come from", () => {
    const flagged = Object.fromEntries(FEATURE_PAGES.filter((p) => p.fromDecisions).map((p) => [p.slug, p.fromDecisions]));
    expect(Object.keys(flagged).sort()).toEqual(["keys", "library", "statistics"]);
    expect(flagged["keys"]).toEqual(expect.arrayContaining(["DEC-200", "DEC-201", "DEC-206"]));
    expect(flagged["statistics"]).toEqual(expect.arrayContaining(["DEC-136", "DEC-137", "DEC-138", "DEC-168"]));
  });
});

describe("the home page and the navigation point at the feature pages", () => {
  it("links every home section to its feature page", () => {
    for (const f of FEATURES) {
      const slug = f.id;
      expect(featureBySlug(slug), f.id).toBeDefined();
      expect(f.learnMore, f.id).toEqual({ label: "Learn more", path: featureHref(slug) });
    }
  });

  it("lists Features in the header and the comparison pages in the footer", () => {
    expect(NAV.find((n) => n.path === "features/")?.header).toBe(true);
    expect(NAV.find((n) => n.path === "compare/")?.header).toBe(false);
  });
});
