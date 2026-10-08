/**
 * The Astro integration that writes every page's sharing picture into dist/ once the pages are
 * built (SITE-11). See og.mjs for how a page names its picture.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "node-html-parser";
import { renderOgCard } from "./og.mjs";

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? htmlFiles(full) : full.endsWith(".html") ? [full] : [];
  });
}

/** A site address's path with the base cut off: "/CuePoint/og/a.png" with base "/CuePoint/" -> "og/a.png". */
function underBase(url, base) {
  const path = new URL(url, "https://site.invalid").pathname;
  const b = base.endsWith("/") ? base : `${base}/`;
  return path.startsWith(b) ? path.slice(b.length) : null;
}

/**
 * Writes the missing cards and strips the `og-picture` markers. Pure over a dist folder, so a test
 * could call it on a fixture.
 * @returns {Promise<string[]>} the card paths written, relative to dist
 */
export async function writeOgCards(dist, { base, site }) {
  const written = new Set();
  const host = site ? new URL(site).host : "";
  for (const file of htmlFiles(dist)) {
    const raw = readFileSync(file, "utf8");
    const root = parse(raw);
    const image = root.querySelector('meta[property="og:image"]')?.getAttribute("content");
    const rel = image ? underBase(image, base) : null;
    if (!rel?.startsWith("og/") || written.has(rel)) {
      continue;
    }
    const title = root.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "CuePoint";
    const pictureSrc = root.querySelector('meta[name="og-picture"]')?.getAttribute("content");
    let picture;
    if (pictureSrc) {
      const pictureRel = underBase(pictureSrc, base);
      const pictureFile = pictureRel ? join(dist, pictureRel) : "";
      if (pictureFile && existsSync(pictureFile)) picture = readFileSync(pictureFile);
    }
    const png = await renderOgCard({ title, picture, site: host });
    const target = join(dist, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, png);
    written.add(rel);
  }
  // the marker is a build-time note to this step, not part of the published page
  for (const file of htmlFiles(dist)) {
    const raw = readFileSync(file, "utf8");
    const cleaned = raw.replace(/<meta name="og-picture"[^>]*>/g, "");
    if (cleaned !== raw) writeFileSync(file, cleaned);
  }
  return [...written];
}

/** @returns {import("astro").AstroIntegration} */
export default function ogCards() {
  let base = "/";
  let site = "";
  return {
    name: "cuepoint-og-cards",
    hooks: {
      "astro:config:done": ({ config }) => {
        base = config.base;
        site = config.site ?? "";
      },
      "astro:build:done": async ({ dir, logger }) => {
        const written = await writeOgCards(fileURLToPath(dir), { base, site });
        logger.info(`wrote ${written.length} sharing pictures`);
      },
    },
  };
}
