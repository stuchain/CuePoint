#!/usr/bin/env node
/**
 * `npm run render`: renders both cuts of the promo to out/ (run `npm run build` and `npm run beat`
 * first; `npm run render` does all three).
 *
 *   out/cuepoint-promo-16x9.mp4 / .webm / -poster.png   for the website and YouTube
 *   out/cuepoint-promo-9x16.mp4 / .webm / -poster.png   for Reels, TikTok and Shorts
 *
 * It serves dist/, opens it in headless Chromium with software WebGL (SwiftShader, like the website's
 * stills), seeks the timeline one frame at a time, screenshots the stage, and pipes the frames to
 * ffmpeg with out/beat.wav, loudness-normalized to -14 LUFS for social players.
 *
 * Locally: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run render
 *   --format=wide|tall   one cut only
 *   --frames=N           the first N frames only (a quick look)
 *   --stills=2,9.5,25    no video: one PNG per time (seconds), out/still-<format>-<t>.png
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { FORMATS } from "../src/formats.ts";
import { at, FPS, FRAMES } from "../src/timing.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "out");
const BEAT_WAV = join(OUT, "beat.wav");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const onlyFormat = arg("format");
const frameLimit = arg("frames") ? Number(arg("frames")) : FRAMES;
if (!Number.isInteger(frameLimit) || frameLimit < 1 || frameLimit > FRAMES) throw new Error(`--frames must be 1 to ${FRAMES}`);
const stills = arg("stills")?.split(",").map(Number);
/** The poster is the end card once everything has landed. */
const POSTER_T = at(15, 3.5); // after the last hit's flash and punch have settled
const NAMES = { wide: "cuepoint-promo-16x9", tall: "cuepoint-promo-9x16" };
/** The frames are sRGB PNGs: convert with the BT.709 matrix and say so, or players shift the colors. */
const BT709 = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };

function serve() {
  const server = createServer((req, res) => {
    let path;
    try {
      path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = join(DIST, path || "index.html");
    if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function ffmpeg(args) {
  const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
  // if ffmpeg dies mid-render, the write fails: surface it through `done` instead of crashing on EPIPE
  child.stdin.on("error", () => undefined);
  return { stdin: child.stdin, done };
}

async function renderFormat(browser, origin, format) {
  const { width, height } = FORMATS[format];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  // any error on the page (a lost WebGL context, say) stops the render rather than writing blank frames
  let pageError;
  page.on("pageerror", (e) => {
    pageError = e;
    console.error("page error:", e.stack ?? e.message);
  });
  await page.goto(`${origin}/index.html?format=${format}&render`, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1" || document.documentElement.dataset.error, null, { timeout: 120_000 });
  const err = await page.evaluate(() => document.documentElement.dataset.error);
  if (err) throw new Error(`The promo page failed: ${err}`);
  const stage = page.locator("#stage");
  if (stills) {
    for (const t of stills) {
      await page.evaluate((s) => window.__promo.seek(s), t);
      await stage.screenshot({ path: join(OUT, `still-${format}-${t}.png`), type: "png" });
    }
    await page.close();
    console.log(`${format}: ${stills.length} stills`);
    return;
  }

  const base = join(OUT, NAMES[format]);
  const master = `${base}.master.mkv`;
  // a lossless-enough master first, then the two delivery files from it
  const enc = ffmpeg(["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-vf", "scale=out_color_matrix=bt709:out_range=tv", ...BT709, "-c:v", "libx264", "-preset", "medium", "-crf", "10", "-pix_fmt", "yuv444p", master]);
  const started = Date.now();
  for (let f = 0; f < frameLimit; f++) {
    await page.evaluate((t) => window.__promo.seek(t), f / FPS);
    const png = await stage.screenshot({ type: "png", animations: "disabled", caret: "hide" });
    if (pageError) throw new Error(`The promo page failed at frame ${f}: ${pageError.message}`);
    if (!enc.stdin.write(png)) await Promise.race([new Promise((r) => enc.stdin.once("drain", r)), enc.done]);
    if (f % 60 === 0) console.log(`${format}: frame ${f}/${frameLimit}  ${((Date.now() - started) / 1000).toFixed(0)} s`);
  }
  enc.stdin.end();
  await enc.done;

  await page.evaluate((t) => window.__promo.seek(t), POSTER_T);
  await stage.screenshot({ path: `${base}-poster.png`, type: "png" });
  await page.close();

  const audio = existsSync(BEAT_WAV) ? ["-i", BEAT_WAV] : [];
  const audioMap = audio.length ? ["-map", "0:v", "-map", "1:a", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", "-shortest"] : [];
  // MP4: H.264 + AAC, the file every player and social upload takes; nearest-neighbor stays sharp at crf 16
  await ffmpeg(["-i", master, ...audio, ...audioMap, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-tune", "animation", "-pix_fmt", "yuv420p", ...BT709, "-movflags", "+faststart", ...(audio.length ? ["-c:a", "aac", "-b:a", "192k"] : []), `${base}.mp4`]).done;
  // WebM: VP9 + Opus, for the website's <video>
  await ffmpeg(["-i", master, ...audio, ...audioMap, "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p", ...BT709, ...(audio.length ? ["-c:a", "libopus", "-b:a", "128k"] : []), `${base}.webm`]).done;
  console.log(`${format}: ${base}.mp4, .webm, -poster.png`);
}

async function main() {
  if (!existsSync(join(DIST, "index.html"))) throw new Error("No dist/: run `npm run build` first");
  mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    executablePath: process.env["PW_CHROMIUM_PATH"] || undefined,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  try {
    for (const format of onlyFormat ? [onlyFormat] : Object.keys(FORMATS)) {
      if (!(format in FORMATS)) throw new Error(`Unknown format "${format}"`);
      await renderFormat(browser, origin, format);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
