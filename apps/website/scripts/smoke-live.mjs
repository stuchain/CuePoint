/**
 * SITE-13: after a deploy, fetches the live home, robots.txt and sitemap.xml over HTTPS and checks the
 * home's canonical is the site's address. Pages and its certificate can take a few minutes to serve a
 * new deploy, so each fetch is retried before the check fails. The url can be Pages' github.io address
 * before the domain is set: the canonical and robots.txt still name the site's address.
 *
 * Usage: node scripts/smoke-live.mjs [url]   (default: SITE_URL from site.config.ts)
 */
import { fileURLToPath } from "node:url";
import { readSiteConfig } from "./check-site.mjs";

/** The problems with one fetched home, robots.txt and sitemap; empty when the site is right. */
export function smokeProblems({ siteUrl, home, robots, sitemap }) {
  const problems = [];
  const canonical = /<link[^>]+rel=["']?canonical["']?[^>]*>/i.exec(home)?.[0];
  const href = canonical && /href=["']?([^"'\s>]+)/i.exec(canonical)?.[1];
  if (href !== siteUrl) problems.push(`the home's canonical is ${href ?? "missing"}, expected ${siteUrl}`);
  if (/<meta[^>]+name=["']?robots["']?[^>]+noindex/i.test(home)) problems.push("the home carries noindex: the deploy built a preview");
  if (/^Disallow:\s*\/\s*$/m.test(robots)) problems.push("robots.txt still tells every crawler to stay out: the deploy built a preview");
  if (!robots.includes(`${siteUrl}sitemap-index.xml`) && !robots.includes(`${siteUrl}sitemap.xml`)) {
    problems.push("robots.txt does not name the sitemap at the site's address");
  }
  if (!/<(urlset|sitemapindex)\b/.test(sitemap)) problems.push("the sitemap is not a sitemap");
  return problems;
}

async function fetchText(url, { tries = 20, waitMs = 30_000 } = {}) {
  let last = "";
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (res.ok) return await res.text();
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = String(err?.cause?.code ?? err);
    }
    console.log(`smoke-live: ${url} not served yet (${last}), try ${i} of ${tries}`);
    if (i < tries) await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error(`smoke-live: ${url} failed after ${tries} tries (${last})`);
}

async function main() {
  const { siteUrl } = readSiteConfig();
  const url = new URL(process.argv[2] ?? siteUrl).href;
  const home = await fetchText(url);
  const robots = await fetchText(`${url}robots.txt`);
  // fetched from the deploy's own address: before the domain's DNS points here, the site's is not served yet
  const sitemap = await fetchText(`${url}sitemap-index.xml`);
  const problems = smokeProblems({ siteUrl, home, robots, sitemap });
  for (const p of problems) console.error(`smoke-live: ${p}`);
  if (problems.length) process.exit(1);
  console.log(`smoke-live: ${url} is live, public, and its canonical is ${siteUrl}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
