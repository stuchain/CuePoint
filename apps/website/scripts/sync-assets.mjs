#!/usr/bin/env node
/**
 * Generates the site's optimized pixel mark (the Camelot wheel icon, DEC-210) at
 * src/assets/mark/mark-32.svg from the app's own grid, apps/desktop-electron/build/icon-source/mark-32.svg.
 * The source has one <rect> per cell; here horizontal runs of same-colored cells in a row become one
 * sub-path, and each fill color becomes one <path>. The site draws no mark of its own (DEC-198).
 *
 * `optimizeMark()` is pure (the tests call it); the CLI below reads the source and writes the result.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { neoDarkTokens } from "./theme-colors.mjs";

const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** Optimized SVG text for a one-<rect>-per-cell mark SVG. Keeps the viewBox and crispEdges. */
export function optimizeMark(source) {
  const root = /<svg\b[^>]*>/.exec(source)?.[0];
  if (!root) throw new Error("sync-assets: no <svg> element in the mark source");
  const viewBox = attr(root, "viewBox");
  if (!viewBox) throw new Error("sync-assets: the mark source has no viewBox");
  const width = attr(root, "width");
  const height = attr(root, "height");

  /** fill -> row -> sorted x list */
  const fills = new Map();
  for (const [tag] of source.matchAll(/<rect\b[^>]*>/g)) {
    const x = Number(attr(tag, "x") ?? 0);
    const y = Number(attr(tag, "y") ?? 0);
    const w = Number(attr(tag, "width"));
    const h = Number(attr(tag, "height"));
    const fill = (attr(tag, "fill") ?? "#000000").toLowerCase();
    if (w !== 1 || h !== 1 || !Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error(`sync-assets: expected 1x1 cells at whole positions, got ${tag}`);
    }
    if (!fills.has(fill)) fills.set(fill, new Map());
    const rows = fills.get(fill);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push(x);
  }

  const paths = [];
  for (const [fill, rows] of fills) {
    let d = "";
    for (const y of [...rows.keys()].sort((a, b) => a - b)) {
      const xs = [...new Set(rows.get(y))].sort((a, b) => a - b);
      let start = xs[0];
      let prev = start;
      const flush = () => {
        d += `M${start} ${y}h${prev - start + 1}v1h-${prev - start + 1}z`;
      };
      for (const x of xs.slice(1)) {
        if (x === prev + 1) prev = x;
        else {
          flush();
          start = prev = x;
        }
      }
      flush();
    }
    paths.push(`<path fill="${fill}" d="${d}"/>`);
  }

  const size = width && height ? ` width="${width}" height="${height}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${size} shape-rendering="crispEdges">\n${paths.join("\n")}\n</svg>\n`;
}

export const SOURCE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "desktop-electron", "build", "icon-source", "mark-32.svg");
export const TARGET = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "assets", "mark", "mark-32.svg");

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_BUILD = join(HERE, "..", "..", "desktop-electron", "build");
const PUBLIC_DIR = join(HERE, "..", "public");

/**
 * The favicon set in public/ (SITE-03; SITE-11 polishes it). The app's own icon files (DIST-09) are
 * copied, not redrawn: icon.ico becomes favicon.ico and icons/512x512.png becomes icon-512.png. The
 * 192 px icon is the optimized mark drawn at a whole multiple of its 32-cell grid (6x), so every
 * cell stays a sharp square; the 180 px apple-touch-icon is the mark at 5x on a padded canvas
 * (SITE-11). favicon.ico keeps the app's 16, 24, 32, 48, 64, 128 and 256 px sizes.
 */
export async function syncIcons(svg, outDir = PUBLIC_DIR) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "icon.svg"), svg);
  copyFileSync(join(APP_BUILD, "icon.ico"), join(outDir, "favicon.ico"));
  copyFileSync(join(APP_BUILD, "icons", "512x512.png"), join(outDir, "icon-512.png"));
  const png = await sharp(Buffer.from(svg), { density: 72 * (192 / 32) })
    .resize(192, 192, { kernel: "nearest" })
    .png()
    .toBuffer();
  writeFileSync(join(outDir, "icon-192.png"), png);
  // iOS wants 180 px. 180 is not a multiple of the 32-cell grid, so the mark is drawn at 5x (160 px,
  // every cell a whole 5 px square) and centered on a 180 px canvas of the app's background, not
  // scaled by a fraction that would blur the cells.
  const mark160 = await sharp(Buffer.from(svg), { density: 72 * (160 / 32) })
    .resize(160, 160, { kernel: "nearest" })
    .png()
    .toBuffer();
  const apple = await sharp({ create: { width: 180, height: 180, channels: 3, background: neoDarkTokens()["--bg-app"] } })
    .composite([{ input: mark160, left: 10, top: 10 }])
    .png()
    .toBuffer();
  writeFileSync(join(outDir, "apple-touch-icon.png"), apple);
}

async function main() {
  mkdirSync(dirname(TARGET), { recursive: true });
  const svg = optimizeMark(readFileSync(SOURCE, "utf8"));
  writeFileSync(TARGET, svg);
  await syncIcons(svg);
  console.log(`sync-assets: wrote ${TARGET} and the favicon set in ${PUBLIC_DIR}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
