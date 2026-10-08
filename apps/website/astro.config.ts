import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { SITE_URL, addressParts } from "./site.config";

const { site, base } = addressParts(SITE_URL);

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [sitemap()],
});
