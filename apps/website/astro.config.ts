import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import type { Plugin } from "vite";
import { satteri } from "@astrojs/markdown-satteri";
import ogCards from "./scripts/og-integration.mjs";
import { SITE_URL, addressParts, isStyleguide } from "./site.config";
import { guideLinkConfig } from "./src/lib/guide-config";
import { guideLinksPlugin } from "./src/lib/guide-links";
import { scrollWrap } from "./src/lib/scroll-wrap";

const { site, base } = addressParts(SITE_URL);

/**
 * Fonts are the woff2 files of the installed @fontsource packages (OFL), read from node_modules:
 * no CDN, no Google request, and no network at build time.
 */
const fontFile = (pkg: string, file: string) => `./node_modules/${pkg}/files/${file}`;
const PIXELIFY = "@fontsource/pixelify-sans";
const PROSE = "@fontsource-variable/atkinson-hyperlegible-next";

/**
 * SITE-05: src/three/boot.ts holds the string "__CUEPOINT_3D_ENTRY__" where the URL of the 3D entry chunk
 * belongs, so it can <link rel=modulepreload> it at idle (the chunk's static imports follow). The
 * chunk's hashed name is known only after bundling, so it is filled in here.
 */
function threeEntryUrl(base: string): Plugin {
  const PLACEHOLDER = /(["'`])__CUEPOINT_3D_ENTRY__\1/;
  return {
    name: "cuepoint-3d-entry-url",
    apply: "build",
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (c) => c.type === "chunk" && c.facadeModuleId?.replaceAll("\\", "/").endsWith("/src/three/entry.ts"),
      );
      const url = entry ? `${base}${entry.fileName}` : "";
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === "chunk" && PLACEHOLDER.test(chunk.code)) {
          chunk.code = chunk.code.replace(PLACEHOLDER, JSON.stringify(url));
        }
      }
    },
  };
}

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  vite: { plugins: [threeEntryUrl(base)] },
  // Markdown: the guide's links are rewritten (SITE-09); no highlighter, code is plain and themed by CSS.
  markdown: {
    syntaxHighlight: false,
    processor: satteri({
      mdastPlugins: [guideLinksPlugin(guideLinkConfig())],
      hastPlugins: [scrollWrap],
    }),
  },
  integrations: [
    sitemap({
      // The style guide exists only in preview builds; keep it out of the sitemap whatever happens.
      filter: (page) => !isStyleguide(new URL(page).pathname),
    }),
    // draws every page's sharing picture into dist/ once the pages are built (SITE-11)
    ogCards(),
  ],
  fonts: [
    {
      name: "Pixelify Sans",
      cssVariable: "--font-pixelify",
      provider: fontProviders.local(),
      options: {
        variants: [600, 700].map((weight) => ({
          weight,
          style: "normal" as const,
          src: [fontFile(PIXELIFY, `pixelify-sans-latin-${weight}-normal.woff2`)] as [string],
        })) as [{ weight: number; style: "normal"; src: [string] }],
      },
      display: "swap",
      fallbacks: ["Segoe UI", "sans-serif"],
      optimizedFallbacks: true,
    },
    {
      name: "Atkinson Hyperlegible Next",
      cssVariable: "--font-prose",
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            weight: "200 800",
            style: "normal",
            src: [fontFile(PROSE, "atkinson-hyperlegible-next-latin-wght-normal.woff2")],
          },
          {
            weight: "200 800",
            style: "italic",
            src: [fontFile(PROSE, "atkinson-hyperlegible-next-latin-wght-italic.woff2")],
          },
        ],
      },
      display: "swap",
      fallbacks: ["system-ui", "sans-serif"],
      optimizedFallbacks: true,
    },
  ],
});
