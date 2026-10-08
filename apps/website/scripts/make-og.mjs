#!/usr/bin/env node
/**
 * Makes the placeholder social card src/assets/og/default.png (1200x630): the app's mark on the
 * Neo Dark background. SITE-11 replaces it with a designed card. Run `npm run og-image` to redo it.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const mark = join(here, "..", "..", "desktop-electron", "build", "icon-source", "mark-64.svg");
const out = join(here, "..", "src", "assets", "og", "default.png");
mkdirSync(dirname(out), { recursive: true });

const SIZE = 448; // 64 cells at 7px
const markPng = await sharp(mark, { density: 72 * (SIZE / 64) })
  .resize(SIZE, SIZE, { kernel: "nearest" })
  .png()
  .toBuffer();

await sharp({ create: { width: 1200, height: 630, channels: 4, background: "#18181b" } })
  .composite([
    // hard shadow, then the mark
    { input: { create: { width: SIZE, height: SIZE, channels: 4, background: "#09090b" } }, left: 376 + 16, top: 91 + 16 },
    { input: markPng, left: 376, top: 91 },
  ])
  .png()
  .toFile(out);
console.log(`make-og: wrote ${out}`);
