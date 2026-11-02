#!/usr/bin/env node
/**
 * Render the 30 s graphic story (story/index.html, 1080 x 1920) frame by frame.
 *   node scripts/render-story.mjs                       -> out/story/cuepoint-story-9x16.mp4 (silent)
 *   --track=<mp3> --start=173.39                        -> ...-PRIVATE.mp4 with the track under it (never committed)
 *   --stills=1.5,4.2                                    -> PNGs only, out/story/still-<t>.png
 */
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out", "story");
const FPS = 30;
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const track = arg("track");
const start = Number(arg("start") ?? 0);
const stills = arg("stills")?.split(",").map(Number);
const BT709 = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2" };

function run(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
}
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
function encoder(args) {
  const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => child.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)))));
  child.stdin.on("error", () => undefined);
  return { stdin: child.stdin, done };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    page.on("pageerror", (e) => console.error("page error:", e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/story/index.html`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    const total = await page.evaluate(() => window.__story.duration);
    const stage = page.locator("#stage");
    if (stills) {
      for (const t of stills) {
        await page.evaluate((s) => window.__story.seek(s), t);
        await stage.screenshot({ path: join(OUT, `still-${t}.png`) });
      }
      console.log(`${stills.length} stills`);
      return;
    }
    const base = join(OUT, "cuepoint-story-9x16");
    const master = `${base}.master.mkv`;
    const enc = encoder(["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-vf", "scale=out_color_matrix=bt709:out_range=tv", ...BT709, "-c:v", "libx264", "-preset", "medium", "-crf", "10", "-pix_fmt", "yuv444p", master]);
    const frames = Math.round(total * FPS);
    const began = Date.now();
    for (let f = 0; f < frames; f++) {
      await page.evaluate((t) => window.__story.seek(t), f / FPS);
      const png = await stage.screenshot({ type: "png", animations: "disabled", caret: "hide" });
      if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once("drain", r));
      if (f % 150 === 0) console.log(`frame ${f}/${frames} ${((Date.now() - began) / 1000).toFixed(0)} s`);
    }
    enc.stdin.end();
    await enc.done;
    await page.evaluate(() => window.__story.seek(window.__story.bar(3)));
    await stage.screenshot({ path: `${base}-poster.png` });
    const fade = 1.5;
    const audio = track
      ? ["-ss", String(start), "-t", String(total), "-i", track, "-map", "0:v", "-map", "1:a", "-af", `afade=t=in:d=0.05,afade=t=out:st=${(total - fade).toFixed(3)}:d=${fade},loudnorm=I=-14:TP=-1.5:LRA=11`, "-ar", "48000", "-c:a", "aac", "-b:a", "192k"]
      : [];
    const out = `${base}${track ? "-PRIVATE" : ""}.mp4`;
    run(["-i", master, ...audio, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", ...BT709, "-t", String(total), "-movflags", "+faststart", out]);
    console.log(out);
  } finally {
    await browser.close();
    server.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
