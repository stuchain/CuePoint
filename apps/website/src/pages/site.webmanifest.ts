import type { APIRoute } from "astro";
import { neoDarkTokens } from "../../scripts/theme-colors.mjs";
import { SITE_NAME } from "../data/site";
import { hrefFor } from "../lib/url";

/**
 * The web manifest (SITE-11): the app's pixel mark as the icon set, and Neo Dark's colors, read from
 * the app's own tokens so the browser's chrome matches the default theme.
 */
const neoDark = neoDarkTokens();

export const GET: APIRoute = () => {
  const manifest = {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: "CuePoint is a free desktop app for DJs that cleans up a Rekordbox library.",
    start_url: hrefFor(""),
    scope: hrefFor(""),
    display: "browser",
    background_color: neoDark["--bg-app"],
    theme_color: neoDark["--bg-toolbar"],
    icons: [
      { src: hrefFor("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: hrefFor("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
};
