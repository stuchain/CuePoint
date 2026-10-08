/** The one address setting. Astro's `site` and `base` are both derived from it (DEC-139). */
export const SITE_URL = "https://stuchain.github.io/CuePoint/";

/** Every page carries noindex until SITE-13 sets this to true. */
export const PUBLIC = false;

/** Splits an address into Astro's `site` (the origin) and `base` (the path, with a trailing slash). */
export function addressParts(url: string): { site: string; base: string } {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`The site address must be https, got "${url}"`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`The site address must not have a query or hash, got "${url}"`);
  }
  const path = parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`;
  return { site: parsed.origin, base: path };
}
