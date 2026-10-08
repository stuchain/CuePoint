import type { APIRoute } from "astro";
import { SITE_NAME } from "../data/site";
import { hrefFor } from "../lib/url";

/** The web manifest: the app's pixel mark as the icon set (SITE-11 polishes it). */
export const GET: APIRoute = () => {
  const manifest = {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: "CuePoint is a free desktop app for DJs that cleans up a Rekordbox library.",
    start_url: hrefFor(""),
    scope: hrefFor(""),
    display: "browser",
    background_color: "#18181b",
    theme_color: "#18181b",
    icons: [
      { src: hrefFor("icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: hrefFor("icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
  };
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
};
