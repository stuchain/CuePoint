#!/usr/bin/env node
/**
 * `node scripts/render-demo.mjs --raw=<dir>`: the LinkedIn demo (demo/), from the clips that
 * apps/desktop-electron/e2e/capture/demo.spec.ts recorded into <dir>, plus the 26 s promo's own renders
 * for the opening and end card (--promo=<dir> holding cuepoint-promo-9x16*.mp4 and -16x9*.mp4).
 *
 *   --format=portrait|wide   one cut only (default both: 1080 x 1350 for LinkedIn, 1920 x 1080)
 *   --stills=5,12.5          no video: PNGs at those seconds, out/demo/still-<format>-<t>.png
 *   --track=<audio> --start=<s>  your own music under it; the file is named -PRIVATE and never committed
 *
 * Writes out/demo/cuepoint-demo-4x5[-PRIVATE].mp4 and cuepoint-demo-16x9[-PRIVATE].mp4 and posters.
 */
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { END, FORMATS, FPS, OPEN, SHOTS } from "../demo/shots.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out", "demo");
const FRAMES = join(ROOT, "demo", "frames");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const raw = arg("raw");
const promo = arg("promo");
const track = arg("track");
const start = Number(arg("start") ?? 0);
const stills = arg("stills")?.split(",").map(Number);
const formats = arg("format") ? [arg("format")] : Object.keys(FORMATS);
const NAMES = { portrait: "cuepoint-demo-4x5", wide: "cuepoint-demo-16x9" };
const BT709 = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };

function run(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
}
const duration = (file) =>
  Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).stdout.toString());
const count = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".jpg")).length : 0);

/** One shot's frames: its clip's in..out stretched to exactly the slot's frame count. */
function extractShot(shot) {
  const dir = join(FRAMES, shot.id);
  if (count(dir) === shot.frames) return;
  const file = join(raw, `${shot.id}.mkv`);
  if (!existsSync(file)) throw new Error(`No clip ${file}`);
  const parts = shot.parts ?? [[0, duration(file)]];
  const length = parts.reduce((sum, [a, b]) => sum + (b - a), 0);
  const k = shot.frames / FPS / length;
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) spawnSync("rm", [join(dir, f)]);
  const trims = parts.map(([a, b], i) => `[0:v]trim=${a}:${b},setpts=PTS-STARTPTS[p${i}]`).join(";");
  const joined = parts.map((_, i) => `[p${i}]`).join("") + `concat=n=${parts.length}:v=1[c]`;
  const graph = `${trims};${joined};[c]setpts=PTS*${k.toFixed(5)},fps=${FPS},scale=2048:-1:flags=lanczos,tpad=stop_mode=clone:stop_duration=2[v]`;
  run(["-i", file, "-filter_complex", graph, "-map", "[v]", "-frames:v", String(shot.frames), "-q:v", "3", join(dir, "%05d.jpg")]);
}

/** Opening and end card frames, from the promo's tall and wide renders. */
function extractPromo(part, format) {
  const dir = join(FRAMES, `${part.id}-${format}`);
  if (count(dir) === part.frames) return;
  const name = format === "wide" ? "cuepoint-promo-16x9" : "cuepoint-promo-9x16";
  const file = [`${name}.mp4`, `${name}-water-PRIVATE.mp4`].map((f) => join(promo ?? "", f)).find(existsSync);
  if (!file) throw new Error(`No ${name} render in --promo`);
  mkdirSync(dir, { recursive: true });
  run(["-ss", String(part.from), "-i", file, "-an", "-vf", `fps=${FPS},tpad=stop_mode=clone:stop_duration=10`, "-frames:v", String(part.frames), "-q:v", "2", join(dir, "%05d.jpg")]);
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
  if (!raw) throw new Error("--raw=<dir of recorded clips> is required");
  mkdirSync(OUT, { recursive: true });
  for (const shot of SHOTS) extractShot(shot);
  for (const format of formats) for (const part of [OPEN, END]) extractPromo(part, format);
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  try {
    for (const format of formats) {
      const { width, height } = FORMATS[format];
      const page = await browser.newPage({ viewport: { width, height } });
      page.on("pageerror", (e) => console.error("page error:", e.message));
      await page.goto(`${origin}/demo/index.html?format=${format}`);
      await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
      const total = await page.evaluate(() => window.__demo.duration);
      const stage = page.locator("#stage");
      if (stills) {
        for (const t of stills) {
          await page.evaluate((s) => window.__demo.seek(s), t);
          await stage.screenshot({ path: join(OUT, `still-${format}-${t}.png`) });
        }
        console.log(`${format}: ${stills.length} stills`);
        continue;
      }
      const base = join(OUT, NAMES[format]);
      const master = `${base}.master.mkv`;
      const enc = encoder(["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-vf", "scale=out_color_matrix=bt709:out_range=tv", ...BT709, "-c:v", "libx264", "-preset", "medium", "-crf", "10", "-pix_fmt", "yuv444p", master]);
      const frames = Math.round(total * FPS);
      const began = Date.now();
      for (let f = 0; f < frames; f++) {
        await page.evaluate((t) => window.__demo.seek(t), f / FPS);
        const png = await stage.screenshot({ type: "png", animations: "disabled", caret: "hide" });
        if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once("drain", r));
        if (f % 150 === 0) console.log(`${format}: frame ${f}/${frames} ${((Date.now() - began) / 1000).toFixed(0)} s`);
      }
      enc.stdin.end();
      await enc.done;
      await page.evaluate((t) => window.__demo.seek(t), OPEN.seconds + 6);
      await stage.screenshot({ path: `${base}-poster.png` });
      await page.close();
      const fade = 1.5;
      const audio = track
        ? ["-ss", String(start), "-t", String(total), "-i", track, "-map", "0:v", "-map", "1:a", "-af", `afade=t=in:d=0.05,afade=t=out:st=${(total - fade).toFixed(3)}:d=${fade},loudnorm=I=-14:TP=-1.5:LRA=11`, "-ar", "48000", "-c:a", "aac", "-b:a", "192k"]
        : [];
      const out = `${base}${track ? "-PRIVATE" : ""}.mp4`;
      run(["-i", master, ...audio, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", ...BT709, "-t", String(total), "-movflags", "+faststart", out]);
      console.log(out);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
