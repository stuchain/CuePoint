import type { APIRoute } from "astro";
import { legacyAppcast } from "../../../../lib/legacy-appcast";
import { loadReleases } from "../../../../lib/releases";

/** The retired 0.0.x app's update feed for macos, pointing at the newest normal release (Sentry PYTHON-1G). */
export const GET: APIRoute = () =>
  new Response(legacyAppcast(loadReleases(), "macos"), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
