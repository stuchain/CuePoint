import { SITE_URL } from "../../site.config";

/**
 * The absolute address of a page: the site address plus the path. `path` is relative to the base,
 * so "" is the home page and "download/" is `<site>/download/`. A leading slash is tolerated and a page
 * path always ends with a slash (a path with a file extension, like rss.xml, does not). Absolute
 * addresses and ".." segments throw.
 */
export function canonicalFor(path: string, siteUrl: string = SITE_URL): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) {
    throw new Error(`canonicalFor: expected a path relative to the base, got "${path}"`);
  }
  const clean = path.replace(/^\/+/, "");
  if (clean.split(/[/\\]/).includes("..")) {
    throw new Error(`canonicalFor: ".." segments are not allowed, got "${path}"`);
  }
  const base = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  // page paths end with a slash; files (rss.xml) keep their name
  const last = clean.slice(clean.lastIndexOf("/") + 1);
  const withSlash = clean === "" || clean.endsWith("/") || /\.[a-z0-9]+$/i.test(last) ? clean : `${clean}/`;
  return new URL(withSlash, base).href;
}

/** A link to a page of this site from a path relative to the base, honoring Astro's base. */
export function hrefFor(path: string, base: string = import.meta.env.BASE_URL): string {
  const b = base.endsWith("/") ? base : `${base}/`;
  return `${b}${path.replace(/^\/+/, "")}`;
}
