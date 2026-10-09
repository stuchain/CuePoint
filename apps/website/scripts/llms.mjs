/**
 * /llms.txt (https://llmstxt.org/): a plain-text index of the site for AI search and assistants, written
 * into dist/ once the pages are built. It is made from the built pages themselves, so it says what each
 * page's own <title>, meta description and canonical address say, and lists exactly the pages a search
 * engine may index: every page but the 404, the thank-you pages and the style guide (the sitemap's rule).
 * It is a file in dist/, not a page, so the sitemap never lists it. check-site's `llms-txt` rule checks it.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";

/** The sections of the file, in order, and which page paths (after the base) belong to each. */
export const LLMS_SECTIONS = [
  { title: "Product", match: (p) => p === "" || p.startsWith("features/") || p.startsWith("compare/") || p === "download/" || p === "changelog/" },
  { title: "User guide", match: (p) => p.startsWith("guide/") },
  { title: "Help", match: (p) => p === "faq/" || p === "contact/" || p === "report-a-bug/" },
  { title: "Blog", match: (p) => p.startsWith("blog/") },
  // "Optional" is the convention's name for what a reader may skip
  { title: "Optional", match: () => true },
];

/** Pages whose role is to be found in search; the sitemap lists the same. `file` is relative to dist. */
export function isIndexableFile(file) {
  if (file === "404.html" || file === "404/index.html") return false;
  if (/(^|\/)thank-?you(\/|\.html$)/.test(file)) return false;
  if (file === "styleguide/index.html" || file.startsWith("styleguide/")) return false;
  return true;
}

const pagePath = (file) => (file === "index.html" ? "" : file.endsWith("/index.html") ? file.slice(0, -"index.html".length) : file);

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? htmlFiles(full) : full.endsWith(".html") ? [full] : [];
  });
}

/**
 * Every indexable page of a build: { path, url, title, description, links }. `links` are the page's
 * own links, in order, used to put a section's pages in the order the site shows them.
 */
export function readPages(dist) {
  return htmlFiles(dist)
    .map((full) => relative(dist, full).split(sep).join("/"))
    .filter(isIndexableFile)
    .sort()
    .map((file) => {
      const root = parse(readFileSync(join(dist, file), "utf8"));
      return {
        path: pagePath(file),
        url: root.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "",
        title: root.querySelector("head > title")?.text.trim() ?? "",
        description: root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "",
        links: root.querySelectorAll("main a[href]").map((a) => a.getAttribute("href") ?? ""),
      };
    });
}

/** A page's title without the site's suffix ("Getting started | CuePoint guide" -> "Getting started"). */
export function shortTitle(title) {
  return title.replace(/\s+\|\s+CuePoint( guide)?$/, "").trim();
}

/**
 * The file's text. `pages` as readPages returns them; the home page's description is the summary.
 * Inside a section, an overview page comes first, then pages in the order the home page, the overviews and
 * the guide's index link them, then by address.
 */
export function buildLlmsTxt(pages, { siteName, siteUrl, base = "/" }) {
  const home = pages.find((p) => p.path === "");
  const hubs = ["", "features/", "compare/", "guide/", "blog/"].map((h) => pages.find((p) => p.path === h)).filter(Boolean);
  const order = new Map();
  const toPath = (href) => {
    try {
      const u = new URL(href, siteUrl);
      return u.pathname.startsWith(base) ? u.pathname.slice(base.length) : null;
    } catch {
      return null;
    }
  };
  // an overview page comes before the pages it lists
  for (const hub of hubs) order.set(hub.path, order.size);
  for (const hub of hubs) {
    for (const href of hub.links) {
      const p = toPath(href);
      if (p !== null && !order.has(p)) order.set(p, order.size);
    }
  }
  const rank = (p) => order.get(p.path) ?? Number.MAX_SAFE_INTEGER;
  const placed = new Set();
  const lines = [`# ${siteName}`, ""];
  if (home?.description) lines.push(`> ${home.description}`, "");
  lines.push(
    `This is an index of every page on ${siteUrl}, one line each: the page's title, its address and what it covers.`,
    "",
  );
  for (const section of LLMS_SECTIONS) {
    const inSection = pages
      .filter((p) => !placed.has(p) && section.match(p.path))
      .sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
    if (inSection.length === 0) continue;
    lines.push(`## ${section.title}`, "");
    for (const p of inSection) {
      placed.add(p);
      lines.push(`- [${shortTitle(p.title)}](${p.url})${p.description ? `: ${p.description}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Writes dist/llms.txt; returns the number of pages listed. */
export function writeLlmsTxt(dist, options) {
  const pages = readPages(dist);
  writeFileSync(join(dist, "llms.txt"), buildLlmsTxt(pages, options));
  return pages.length;
}

/** @returns {import("astro").AstroIntegration} */
export default function llmsTxt({ siteName }) {
  let base = "/";
  let site = "";
  return {
    name: "cuepoint-llms-txt",
    hooks: {
      "astro:config:done": ({ config }) => {
        base = config.base;
        site = config.site ?? "";
      },
      "astro:build:done": ({ dir, logger }) => {
        const siteUrl = new URL(base, site).href;
        const count = writeLlmsTxt(fileURLToPath(dir), { siteName, siteUrl, base });
        logger.info(`wrote llms.txt with ${count} pages`);
      },
    },
  };
}
