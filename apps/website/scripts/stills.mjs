#!/usr/bin/env node
/**
 * `npm run stills` (SITE-05, fact 8): renders each 3D scene's resting frame to
 * src/assets/stills/<scene>-<theme>.png, for each of the five themes, and records the sources' hash in
 * src/assets/stills/manifest.json. Commit the results: Astro serves them as AVIF and WebP.
 *
 * Why the stills are committed and checked by a hash, not rendered in CI: a render depends on the
 * browser's software GL, three.js and the shader, and is not guaranteed to be byte-identical on another
 * machine. Committing the PNGs keeps the site's pictures the same everywhere; the hash in
 * manifest.json (the scene's source, the pixel look, the theme tokens, the three.js version and this
 * file) lets `npm test` say when they are out of date, without a browser.
 *
 * It starts `astro dev` (the stills must exist before a build can, so it cannot use dist/), opens
 * /styleguide/stills/ in headless Chromium with software WebGL (SwiftShader through ANGLE), switches
 * the page's theme, and calls window.__renderStill(scene, variant) for each of the scene's variants.
 *
 * Locally: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run stills
 *   --scene=cubes   render one scene only (the manifest keeps the others)
 *   --theme=neoDark render one theme only (for looking; the manifest is not updated)
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { MANIFEST, ROOT, STILLS_DIR, readManifest, sceneNames, sourceHash, stillPath, stillStem, themeIds, variantsOf } from "./stills-lib.mjs";

// STILLS_PORT moves the dev server off 4322 for a checkout whose neighbor already holds it
const PORT = Number(process.env["STILLS_PORT"] || 4322);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const only = process.argv.find((a) => a.startsWith("--scene="))?.slice("--scene=".length);
const onlyTheme = process.argv.find((a) => a.startsWith("--theme="))?.slice("--theme=".length);

function startDevServer() {
  // node on astro's own entry, not npx: killing an npx wrapper would leave the server running
  const child = spawn(process.execPath, [join(ROOT, "node_modules", "astro", "bin", "astro.mjs"), "dev", "--host", "127.0.0.1", "--port", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  return { child, log: () => log };
}

async function waitFor(url, server, ms = 90_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`The dev server did not come up at ${url}:\n${server.log()}`);
}

async function main() {
  const scenes = only ? [only] : sceneNames();
  for (const s of scenes) if (!sceneNames().includes(s)) throw new Error(`Unknown scene "${s}"`);
  const themes = onlyTheme ? [onlyTheme] : themeIds();
  mkdirSync(STILLS_DIR, { recursive: true });

  const server = startDevServer();
  let browser;
  try {
    await waitFor(`${ORIGIN}/styleguide/stills/`, server);
    browser = await chromium.launch({
      executablePath: process.env["PW_CHROMIUM_PATH"] || undefined,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    // each still is the render target itself, 320 x 180 (src/three/still-size.ts)
    page.on("pageerror", (e) => console.error("page error:", e.message));

    const manifest = readManifest();
    for (const theme of themes) {
      // the dev server optimises dependencies on first load and may reload the page: try again
      for (let attempt = 1; ; attempt++) {
        try {
          await page.goto(`${ORIGIN}/styleguide/stills/`, { waitUntil: "load" });
          await page.waitForFunction(() => document.documentElement.hasAttribute("data-stills-ready"), null, { timeout: 60_000 });
          await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
          for (const scene of scenes) {
            // the resting frame, each named frame, and the tall shape where the scene has one
            for (const variant of variantsOf(scene)) {
              const url = await page.evaluate(([n, v]) => window.__renderStill(n, v), [scene, variant]);
              const png = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
              // a still has a handful of exact colors: an indexed PNG is lossless and small
              const out = await sharp(png).png({ palette: true, colors: 64, quality: 100, compressionLevel: 9, dither: 0 }).toBuffer();
              writeFileSync(stillPath(scene, theme, variant), out);
              console.log(`${stillStem(scene, variant)}-${theme}.png  ${out.length} bytes`);
            }
          }
          break;
        } catch (error) {
          if (attempt >= 3) throw error;
          console.warn(`retrying ${theme} after: ${String(error).split("\n")[0]}`);
        }
      }
    }
    if (onlyTheme) return console.log("one theme only: manifest.json not updated");
    for (const scene of scenes) manifest[scene] = { sourceHash: sourceHash(scene), themes };
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log("manifest.json written");
  } finally {
    await browser?.close();
    // astro dev detaches from its parent: ask it to stop, then make sure
    spawnSync(process.execPath, [join(ROOT, "node_modules", "astro", "bin", "astro.mjs"), "dev", "stop"], { cwd: ROOT, stdio: "ignore" });
    server.child.kill("SIGKILL");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
