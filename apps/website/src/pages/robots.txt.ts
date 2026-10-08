import type { APIRoute } from "astro";
import { PUBLIC, SITE_URL } from "../../site.config";

/**
 * robots.txt, generated from the one address setting (DEC-139, DEC-141). It names the sitemap that
 * @astrojs/sitemap writes. Until SITE-13 sets PUBLIC, every crawler is told to stay out; every page
 * also carries noindex.
 */
export const GET: APIRoute = () => {
  const lines = ["User-agent: *", PUBLIC ? "Allow: /" : "Disallow: /", "", `Sitemap: ${new URL("sitemap-index.xml", SITE_URL).href}`, ""];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
