#!/usr/bin/env node
/**
 * DEC-141's checks on the built site (SITE-03): `npm run check:site` runs them on dist/.
 *
 * `checkSite(distDir, { base, siteUrl, preview })` is pure with respect to the build: it reads the
 * files under distDir and returns a list of { rule, page, message }, empty when the site is clean.
 * The CLI prints them and exits 1 if there are any. HTML is read with node-html-parser, never regexes.
 *
 * Rules (the `rule` field):
 *   title-missing, description-missing, canonical-missing, title-duplicate, description-duplicate,
 *   title-length (<= 60), description-length (70-160), h1-count (exactly one), heading-skip,
 *   img-alt, noindex-unexpected, sitemap-noindex, sitemap-missing, link-broken, http-url,
 *   jsonld-parse, jsonld-properties, og-image, favicon, manifest, robots-sitemap,
 *   canonical-invalid, sitemap-excluded, noindex-missing, feed-invalid, feed-link-missing
 *
 * Every result has a `severity`: "error" (the CLI exits 1) or "warning" (printed, never fails).
 *
 * `preview` (PUBLIC is false in site.config.ts): every page carries noindex on purpose, so the two
 * rules that compare noindex with the sitemap (noindex-unexpected, sitemap-noindex) are skipped, and
 * every page must carry noindex (noindex-missing). Every indexable page must still be in the sitemap,
 * so the day the flag flips nothing is missing.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "node-html-parser";
import { validateRss } from "./check-feed.mjs";

export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 160;

/**
 * Structured data requirements, per type.
 *
 * Source: Google Search Central, "Structured data" feature guides, as checked 2026-10:
 *   SoftwareApplication  https://developers.google.com/search/docs/appearance/structured-data/software-app
 *     Google requires name, offers.price (0 for free), and one of aggregateRating or review for the
 *     rich result. CuePoint has no real ratings or reviews and must never invent one, so this table fails
 *     on name, offers.price, operatingSystem and applicationCategory (the properties that describe the
 *     app truthfully) and only WARNS (severity "warning", printed, never exit 1) when aggregateRating and
 *     review are both absent: the page is valid schema.org but not rich-result eligible, as Google's
 *     software-app guide requires a rating or review for that.
 *     Recommended, not checked: offers.priceCurrency.
 *   AggregateRating      (any aggregateRating property, typed or not)
 *     ratingValue plus one of ratingCount or reviewCount.
 *   Organization         .../structured-data/organization
 *     Google lists no required property (all recommended). This table requires name and url, the
 *     minimum that names the publisher; that is a site policy, not a Google requirement.
 *   WebSite              .../structured-data/site-names
 *     required: name, url.
 *   FAQPage              .../structured-data/faqpage
 *     required: mainEntity (>= 1 Question), each with name and acceptedAnswer.text.
 *   BreadcrumbList       .../structured-data/breadcrumb
 *     required: itemListElement, at least two ListItem, each with position and a name (item.name counts);
 *     `item` on every item but the last.
 *   BlogPosting          .../structured-data/article
 *     Google lists no required property for Article types (all recommended). This table requires
 *     headline, datePublished, author and image, the recommended ones a post cannot do without; a site
 *     policy, not a Google requirement.
 *
 * Entry fields: required (dotted paths that must hold a value; arrays match if any element does),
 * oneOf (groups of which at least one path must hold a value), each (a list property whose every
 * element needs the nested `required` / `oneOf`), minItems, warnOneOf (groups of which at least one
 * should hold a value; a miss is a warning, not a failure), and extra (a function returning more problems).
 * Nested nodes (mainEntity, itemListElement, ... recursively) are checked by their own @type too.
 */
export const SCHEMA_REQUIREMENTS = {
  SoftwareApplication: {
    required: ["name", "offers.price", "operatingSystem", "applicationCategory"],
    warnOneOf: [["aggregateRating", "review"]],
  },
  AggregateRating: {
    required: ["ratingValue"],
    oneOf: [["ratingCount", "reviewCount"]],
  },
  Organization: { required: ["name", "url"] },
  WebSite: { required: ["name", "url"] },
  FAQPage: {
    required: ["mainEntity"],
    each: { mainEntity: { required: ["name", "acceptedAnswer.text"] } },
  },
  BreadcrumbList: {
    required: ["itemListElement"],
    minItems: { itemListElement: 2 },
    each: { itemListElement: { required: ["position"], oneOf: [["name", "item.name"]] } },
    extra(node) {
      const items = asArray(node.itemListElement);
      return items.slice(0, -1).some((item) => !hasValue(item, "item"))
        ? ["every itemListElement but the last needs an item"]
        : [];
    },
  },
  BlogPosting: { required: ["headline", "datePublished", "author", "image"] },
};

const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/** Every string value in parsed JSON, at any depth. */
function* jsonStrings(value) {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const v of value) yield* jsonStrings(v);
  else if (value && typeof value === "object") for (const v of Object.values(value)) yield* jsonStrings(v);
}

/** True when the dotted path holds a non-empty value (0 counts; arrays match on any element). */
function hasValue(obj, path) {
  const [head, ...rest] = path.split(".");
  return asArray(obj).some((node) => {
    if (node === null || typeof node !== "object") return false;
    const value = node[head];
    if (rest.length === 0) {
      return asArray(value).some((v) => v !== "" && v !== null && v !== undefined);
    }
    return hasValue(value, rest.join("."));
  });
}

// ---------------------------------------------------------------------------------------------
// Reading the build

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const isFile = (p) => existsSync(p) && statSync(p).isFile();
const posix = (p) => p.split(sep).join("/");

/** Every element under a node, in document order. */
function* elements(node) {
  for (const child of node.childNodes ?? []) {
    if (child.nodeType === 1) {
      yield child;
      yield* elements(child);
    }
  }
}

function parseHtml(source) {
  return parse(source, { comment: false, blockTextElements: { script: true, style: true } });
}

const attr = (el, name) => el.getAttribute(name) ?? undefined;
const relTokens = (el) => (attr(el, "rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);

function robotsDirectives(root) {
  const out = [];
  for (const el of elements(root)) {
    if (el.rawTagName?.toLowerCase() !== "meta") continue;
    const name = (attr(el, "name") ?? "").toLowerCase();
    if (name === "robots" || name === "googlebot") {
      out.push(...(attr(el, "content") ?? "").toLowerCase().split(/[\s,]+/).filter(Boolean));
    }
  }
  return out;
}

/** The URL attributes a page can load or link to, as [element, attribute, value] (srcset is split). */
function* urlRefs(root) {
  for (const el of elements(root)) {
    const tag = el.rawTagName.toLowerCase();
    for (const name of ["href", "src", "poster", "xlink:href", "data"]) {
      if (name === "data" && tag !== "object") continue;
      const value = attr(el, name);
      if (value !== undefined) yield [tag, name, value, el];
    }
    const srcset = attr(el, "srcset");
    if (srcset !== undefined) {
      for (const candidate of srcset.trim().split(/,\s+/)) {
        const url = candidate.trim().split(/\s+/)[0]?.replace(/,$/, "");
        if (url && !/^data:/i.test(url)) yield [tag, "srcset", url, el];
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The checks

/**
 * @param {string} distDir
 * @param {{ base: string, siteUrl: string, preview: boolean }} options
 * @returns {{ rule: string, page: string, message: string, severity: "error" | "warning" }[]}
 */
export function checkSite(distDir, { base, siteUrl, preview }) {
  const dist = resolve(distDir);
  const origin = new URL(siteUrl).origin;
  const results = [];
  const seen = new Set();
  const report = (rule, page, message, severity = "error") => {
    const key = `${rule}\u0000${page}\u0000${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ rule, page, message, severity });
  };

  const files = walk(dist).map((f) => posix(relative(dist, f)));
  const htmlFiles = files.filter((f) => f.endsWith(".html")).sort();
  const pages = new Map();
  for (const file of htmlFiles) pages.set(file, parseHtml(readFileSync(join(dist, file), "utf8")));

  /** The page's path after the base: "" for the home page, "a/" for a/index.html, "404.html" for a file. */
  const pagePath = (file) => (file === "index.html" ? "" : file.endsWith("/index.html") ? file.slice(0, -"index.html".length) : file);
  const pageAddress = (file) => `${siteUrl}${pagePath(file)}`;
  const is404 = (file) => file === "404.html" || file === "404/index.html";
  const isThankYou = (file) => /(^|\/)thank-?you(\/|\.html$)/.test(file);
  const isStyleguide = (file) => file === "styleguide/index.html" || file.startsWith("styleguide/");
  const noindexAllowed = (file) => is404(file) || isThankYou(file);
  /** Whether the page's role is to be found in search; the sitemap lists these. */
  const isIndexableRole = (file) => !noindexAllowed(file) && !isStyleguide(file);

  /**
   * Resolves an address found on `file` to a file in dist. Returns null for an address that is not
   * this site's, otherwise { target (dist-relative path or null), problem?, hash }.
   */
  function resolveInternal(value, file) {
    const raw = value.trim();
    if (raw === "") return null;
    let url;
    try {
      url = new URL(raw, `${origin}${base}${pagePath(file)}`);
    } catch {
      return { target: null, problem: `is not a valid address: "${raw}"`, hash: "" };
    }
    if (url.origin !== origin) return null;
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return { target: null, problem: `has a bad escape: "${raw}"`, hash: "" };
    }
    if (!pathname.startsWith(base)) {
      const hint = pathname === base.slice(0, -1) ? " (add the trailing slash)" : "";
      return { target: null, problem: `is outside the base ${base}${hint}: "${raw}"`, hash: "" };
    }
    const rest = pathname.slice(base.length);
    const candidates = rest === "" || rest.endsWith("/") ? [`${rest}index.html`] : [rest, `${rest}/index.html`];
    for (const candidate of candidates) {
      const full = resolve(dist, candidate);
      if (full.startsWith(dist + sep) && isFile(full)) {
        return { target: posix(relative(dist, full)), hash: url.hash.slice(1) };
      }
    }
    return { target: null, problem: `does not exist in the build: "${raw}"`, hash: "" };
  }

  const idCache = new Map();
  const idsOf = (target) => {
    if (!idCache.has(target)) {
      const root = pages.get(target) ?? parseHtml(readFileSync(join(dist, target), "utf8"));
      const ids = new Set();
      for (const el of elements(root)) {
        const id = attr(el, "id");
        if (id) ids.add(id);
        const name = attr(el, "name");
        if (name && el.rawTagName.toLowerCase() === "a") ids.add(name);
      }
      idCache.set(target, ids);
    }
    return idCache.get(target);
  };

  const titles = new Map();
  const descriptions = new Map();
  const sitemapUrls = readSitemap();

  // Per page
  for (const [file, root] of pages) {
    const metaContent = (selectorAttr, key) => {
      for (const el of elements(root)) {
        if (el.rawTagName.toLowerCase() === "meta" && (attr(el, selectorAttr) ?? "").toLowerCase() === key) {
          return attr(el, "content");
        }
      }
      return undefined;
    };
    const linkTag = (predicate) =>
      [...elements(root)].find((el) => el.rawTagName.toLowerCase() === "link" && predicate(el));

    // title, description, canonical
    const titleEl = root.querySelector("head > title");
    const title = titleEl?.text.trim();
    if (!title) report("title-missing", file, "the page has no <title>");
    else {
      if (title.length > TITLE_MAX) report("title-length", file, `the title is ${title.length} characters, over ${TITLE_MAX}: "${title}"`);
      if (!titles.has(title)) titles.set(title, []);
      titles.get(title).push(file);
    }
    const description = metaContent("name", "description")?.trim();
    if (!description) report("description-missing", file, "the page has no meta description");
    else {
      if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
        report("description-length", file, `the description is ${description.length} characters, outside ${DESCRIPTION_MIN}-${DESCRIPTION_MAX}`);
      }
      if (!descriptions.has(description)) descriptions.set(description, []);
      descriptions.get(description).push(file);
    }
    const canonical = linkTag((el) => relTokens(el).includes("canonical"));
    const canonicalHref = canonical ? attr(canonical, "href")?.trim() : undefined;
    if (!canonicalHref) {
      report("canonical-missing", file, "the page has no canonical link");
    } else if (!/^https:\/\//i.test(canonicalHref) || !canonicalHref.startsWith(siteUrl)) {
      report("canonical-invalid", file, `the canonical ${canonicalHref} is not an absolute address under ${siteUrl}`);
    } else if (isIndexableRole(file) && canonicalHref !== pageAddress(file)) {
      report("canonical-invalid", file, `the canonical ${canonicalHref} is not the page's own address ${pageAddress(file)}`);
    }

    // headings
    let h1s = 0;
    let previous = 0;
    for (const el of elements(root)) {
      const m = /^h([1-6])$/.exec(el.rawTagName.toLowerCase());
      if (!m) continue;
      const level = Number(m[1]);
      if (level === 1) h1s++;
      if (previous > 0 && level > previous + 1) {
        report("heading-skip", file, `<h${level}> "${el.text.trim().slice(0, 40)}" follows ${previous === 0 ? "no heading" : `<h${previous}>`}`);
      }
      previous = level;
    }
    if (h1s !== 1) report("h1-count", file, `the page has ${h1s} <h1>, expected exactly one`);

    // images
    for (const el of elements(root)) {
      if (el.rawTagName.toLowerCase() === "img" && attr(el, "alt") === undefined) {
        report("img-alt", file, `<img src="${attr(el, "src") ?? ""}"> has no alt attribute`);
      }
    }

    // noindex
    const noindex = robotsDirectives(root).some((d) => d === "noindex" || d === "none");
    if (noindex && !preview && !noindexAllowed(file)) {
      report("noindex-unexpected", file, "the page carries noindex but is not the 404 or a thank-you page");
    }
    if (preview && !noindex) {
      report("noindex-missing", file, "this is a preview build (PUBLIC is false) and the page does not carry noindex");
    }
    if (!preview && noindex && sitemapUrls?.has(pageAddress(file))) {
      report("sitemap-noindex", file, "the page is in the sitemap and carries noindex");
    } else if (!isIndexableRole(file) && sitemapUrls?.has(pageAddress(file))) {
      report("sitemap-excluded", file, "the 404, thank-you and style guide pages must not be in the sitemap");
    }
    if (sitemapUrls && isIndexableRole(file) && (preview || !noindex) && !sitemapUrls.has(pageAddress(file))) {
      report("sitemap-missing", file, `the page is indexable but ${pageAddress(file)} is not in the sitemap`);
    }

    // links and assets
    for (const [tag, name, value, el] of urlRefs(root)) {
      if (/^http:\/\//i.test(value.trim())) {
        report("http-url", file, `<${tag} ${name}="${value}"> is not https`);
        continue;
      }
      // The 404 page is served by Pages at any URL, so a relative address would break on a deep one.
      if (is404(file) && !/^(\/|#|[a-z][a-z0-9+.-]*:)/i.test(value.trim())) {
        report("link-broken", file, `<${tag} ${name}="${value}"> is relative, but the 404 page is served at any URL: start it with / or use a full address`);
        continue;
      }
      const resolved = resolveInternal(value, file);
      if (!resolved) continue;
      if (!resolved.target) {
        // icons and the manifest have rules of their own
        const rels = tag === "link" ? relTokens(el) : [];
        const rule = rels.includes("manifest") ? "manifest" : rels.some((r) => r.includes("icon")) ? "favicon" : "link-broken";
        report(rule, file, `<${tag} ${name}> ${resolved.problem}`);
        continue;
      }
      // `#:~:text=` and `#id:~:text=` carry a text fragment directive, which is not an id
      const hash = resolved.hash.split(":~:")[0] ?? "";
      if (hash && hash !== "top" && resolved.target.endsWith(".html")) {
        let wanted = hash;
        try {
          wanted = decodeURIComponent(hash);
        } catch {
          /* keep the raw fragment */
        }
        if (!idsOf(resolved.target).has(wanted)) {
          report("link-broken", file, `<${tag} ${name}="${value}"> points at #${hash}, which is not on ${resolved.target}`);
        }
      }
    }

    // URL-valued meta content must be https too
    for (const el of elements(root)) {
      if (el.rawTagName.toLowerCase() !== "meta") continue;
      const key = (attr(el, "property") ?? attr(el, "name") ?? "").toLowerCase();
      const content = (attr(el, "content") ?? "").trim();
      if (/^(og|twitter):/.test(key) && /^http:\/\//i.test(content)) {
        report("http-url", file, `<meta ${key}="${content}"> is not https`);
      }
    }

    // JSON-LD
    for (const el of elements(root)) {
      if (el.rawTagName.toLowerCase() !== "script" || (attr(el, "type") ?? "").toLowerCase() !== "application/ld+json") continue;
      let data;
      try {
        data = JSON.parse(el.rawText);
      } catch (error) {
        report("jsonld-parse", file, `a JSON-LD block does not parse: ${error.message}`);
        continue;
      }
      for (const text of jsonStrings(data)) {
        if (/^http:\/\//i.test(text.trim())) report("http-url", file, `JSON-LD value "${text}" is not https`);
      }
      checkJsonLd(data, file);
    }

    // og:image
    const og = metaContent("property", "og:image");
    if (!og) report("og-image", file, "the page has no og:image");
    else {
      const resolved = resolveInternal(og, file);
      if (!resolved) report("og-image", file, `og:image is not on this site: ${og}`);
      else if (!resolved.target) report("og-image", file, `og:image ${resolved.problem}`);
    }

    // favicon links
    const icons = [...elements(root)].filter((el) => el.rawTagName.toLowerCase() === "link");
    for (const [label, test] of [
      ["an icon link", (el) => relTokens(el).includes("icon")],
      ["an apple-touch-icon link", (el) => relTokens(el).includes("apple-touch-icon")],
      ["a manifest link", (el) => relTokens(el).includes("manifest")],
    ]) {
      if (!icons.some(test)) report("favicon", file, `the page has no ${label}`);
    }
  }

  // Uniqueness
  for (const [title, where] of titles) {
    if (where.length > 1) for (const f of where) report("title-duplicate", f, `the title "${title}" is also on ${where.filter((w) => w !== f).join(", ")}`);
  }
  for (const [description, where] of descriptions) {
    if (where.length > 1) {
      for (const f of where) report("description-duplicate", f, `the description is also on ${where.filter((w) => w !== f).join(", ")}: "${description.slice(0, 50)}..."`);
    }
  }

  // Site-wide files
  for (const required of ["favicon.ico", "icon.svg", "apple-touch-icon.png", "icon-192.png", "icon-512.png"]) {
    if (!isFile(join(dist, required))) report("favicon", required, `${required} is missing from the build`);
  }
  checkManifest();
  checkRobots();
  checkFeed();

  return results;

  // -------------------------------------------------------------------------------------------

  /**
   * The RSS feed (SITE-10): when the build has blog/rss.xml it must be RSS 2.0, and every page must
   * link it with <link rel="alternate" type="application/rss+xml">. A page linking a feed that is
   * not built is caught by the link check above.
   */
  function checkFeed() {
    const feedFile = "blog/rss.xml";
    if (!isFile(join(dist, feedFile))) return;
    for (const problem of validateRss(readFileSync(join(dist, feedFile), "utf8"))) {
      report("feed-invalid", feedFile, problem);
    }
    for (const [file, root] of pages) {
      const head = root.querySelector("head");
      const wanted = [`${siteUrl}${feedFile}`, `${base}${feedFile}`];
      const links = head
        ? [...elements(head)].some(
            (el) =>
              el.rawTagName.toLowerCase() === "link" &&
              relTokens(el).includes("alternate") &&
              (attr(el, "type") ?? "").toLowerCase() === "application/rss+xml" &&
              wanted.includes((attr(el, "href") ?? "").trim()),
          )
        : false;
      if (!links) {
        report("feed-link-missing", file, `the head does not link the feed: <link rel="alternate" type="application/rss+xml" href="${base}${feedFile}">`);
      }
    }
  }

  function readSitemap() {
    const indexPath = join(dist, "sitemap-index.xml");
    if (!isFile(indexPath)) {
      report("sitemap-missing", "sitemap-index.xml", "sitemap-index.xml is missing from the build");
      return null;
    }
    const urls = new Set();
    const locs = (xml) => [...elements(parse(xml))].filter((el) => el.rawTagName.toLowerCase() === "loc").map((el) => el.text.trim());
    for (const loc of locs(readFileSync(indexPath, "utf8"))) {
      const rel = loc.startsWith(siteUrl) ? loc.slice(siteUrl.length) : null;
      const path = rel === null ? null : join(dist, rel);
      if (!path || !isFile(path)) {
        report("sitemap-missing", "sitemap-index.xml", `the index lists ${loc}, which is not in the build`);
        continue;
      }
      for (const url of locs(readFileSync(path, "utf8"))) {
        urls.add(url);
        const resolved = url.startsWith(siteUrl) ? resolveInternal(url, "index.html") : null;
        if (!resolved?.target || !resolved.target.endsWith(".html") || pageAddress(resolved.target) !== url) {
          report("sitemap-missing", rel, `the sitemap lists ${url}, which is not a page in the build`);
        }
      }
    }
    return urls;
  }

  function checkManifest() {
    const path = join(dist, "site.webmanifest");
    if (!isFile(path)) {
      report("manifest", "site.webmanifest", "site.webmanifest is missing from the build");
      return;
    }
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      report("manifest", "site.webmanifest", `site.webmanifest is not JSON: ${error.message}`);
      return;
    }
    if (!manifest.name) report("manifest", "site.webmanifest", "site.webmanifest has no name");
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      report("manifest", "site.webmanifest", "site.webmanifest lists no icons");
      return;
    }
    for (const icon of manifest.icons) {
      const resolved = resolveInternal(String(icon.src ?? ""), "index.html");
      if (!resolved?.target) report("favicon", "site.webmanifest", `the manifest icon ${icon.src} ${resolved?.problem ?? "is not on this site"}`);
    }
  }

  function checkRobots() {
    const path = join(dist, "robots.txt");
    if (!isFile(path)) {
      report("robots-sitemap", "robots.txt", "robots.txt is missing from the build");
      return;
    }
    const named = [...readFileSync(path, "utf8").matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    const expected = `${siteUrl}sitemap-index.xml`;
    if (!named.includes(expected)) {
      report("robots-sitemap", "robots.txt", `robots.txt does not name the sitemap ${expected}${named.length ? ` (it names ${named.join(", ")})` : ""}`);
    }
  }

  function checkJsonLd(data, file) {
    const nodes = [];
    /** Collects every object in the tree as a node; `forced` is the type an aggregateRating value must have. */
    const collect = (value, inherited, forced) => {
      for (const item of asArray(value)) {
        if (item === null || typeof item !== "object") continue;
        const context = item["@context"] ?? inherited;
        if (item["@graph"]) {
          collect(item["@graph"], context);
          continue;
        }
        nodes.push({ node: item, context, forced });
        for (const [key, child] of Object.entries(item)) {
          if (key.startsWith("@")) continue;
          collect(child, context, key === "aggregateRating" ? "AggregateRating" : undefined);
        }
      }
    };
    collect(data, undefined);
    for (const { node, context, forced } of nodes) {
      const types = asArray(node["@type"]).filter((t) => typeof t === "string");
      if (forced && !types.includes(forced)) types.push(forced);
      const known = types.filter((t) => t in SCHEMA_REQUIREMENTS);
      if (known.length === 0) continue;
      const label = known.join("/");
      if (!/schema\.org/.test(JSON.stringify(context ?? ""))) report("jsonld-properties", file, `${label} has no @context of schema.org`);
      for (const type of known) {
        const spec = SCHEMA_REQUIREMENTS[type];
        const problems = [];
        const needs = (target, rules, prefix) => {
          for (const path of rules.required ?? []) if (!hasValue(target, path)) problems.push(`${prefix}lacks ${path}`);
          for (const group of rules.oneOf ?? []) {
            if (!group.some((path) => hasValue(target, path))) problems.push(`${prefix}needs one of ${group.join(" or ")}`);
          }
        };
        needs(node, spec, "");
        for (const [prop, min] of Object.entries(spec.minItems ?? {})) {
          if (asArray(node[prop]).length < min) problems.push(`${prop} needs at least ${min} items`);
        }
        for (const [prop, rules] of Object.entries(spec.each ?? {})) {
          for (const [i, element] of asArray(node[prop]).entries()) needs(element, rules, `${prop}[${i}] `);
        }
        if (spec.extra) problems.push(...spec.extra(node));
        for (const problem of problems) report("jsonld-properties", file, `${type} ${problem}`);
        for (const group of spec.warnOneOf ?? []) {
          if (!group.some((path) => hasValue(node, path))) {
            report(
              "jsonld-properties",
              file,
              `${type} has no ${group.join(" or ")}; Google requires one for the ${type} rich result. Never invent one: without it the page is valid but not rich-result eligible`,
              "warning",
            );
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// CLI

const HERE = dirname(fileURLToPath(import.meta.url));

/** SITE_URL and PUBLIC read from site.config.ts (Node 22.12 cannot import .ts), failing loudly if they move. */
export function readSiteConfig(path = join(HERE, "..", "site.config.ts")) {
  const source = readFileSync(path, "utf8");
  // anchored to the line start, so a commented-out line never matches; allows a type annotation and either quote
  const url = /^export const SITE_URL\s*(?::\s*string\s*)?=\s*(["'])(.+?)\1/m.exec(source)?.[2];
  const isPublic = /^export const PUBLIC\s*(?::\s*boolean\s*)?=\s*(true|false)\b/m.exec(source)?.[1];
  if (!url || !isPublic) throw new Error(`check-site: could not read SITE_URL and PUBLIC from ${path}`);
  const parsed = new URL(url);
  const base = parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`;
  return { siteUrl: `${parsed.origin}${base}`, base, preview: isPublic === "false" };
}

function main() {
  const distDir = resolve(process.argv[2] ?? join(HERE, "..", "dist"));
  if (!existsSync(distDir)) {
    console.error(`check-site: ${distDir} does not exist. Run npm run build first.`);
    process.exit(2);
  }
  const config = readSiteConfig();
  const results = checkSite(distDir, config);
  const pageCount = walk(distDir).filter((f) => f.endsWith(".html")).length;
  if (results.length === 0) {
    console.log(`check-site: ${pageCount} pages, no problems${config.preview ? " (preview build: noindex expected)" : ""}.`);
    return;
  }
  const errors = results.filter((r) => r.severity !== "warning");
  const warnings = results.filter((r) => r.severity === "warning");
  for (const r of results) console.error(`${r.severity === "warning" ? "warning" : "error"}  ${r.rule}  ${r.page}  ${r.message}`);
  if (errors.length === 0) {
    console.log(`check-site: ${pageCount} pages, no problems, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`);
    return;
  }
  console.error(`\ncheck-site: ${errors.length} problem${errors.length === 1 ? "" : "s"} and ${warnings.length} warning${warnings.length === 1 ? "" : "s"} on ${pageCount} pages.`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
