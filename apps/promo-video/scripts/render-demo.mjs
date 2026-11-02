#!/usr/bin/env node
/**
 * `node scripts/render-demo.mjs --raw=<dir>`: the LinkedIn demo (demo/), from the clips that
 * apps/desktop-electron/e2e/capture/demo.spec.ts recorded into <dir>. The opening and end card are title cards
 * the page draws itself.
 *
 *   --format=portrait|wide   one cut only (default both: 1080 x 1350 for LinkedIn, 1920 x 1080)
 *   --opening=a,b,c          which openings (default all three: pull back, logo build, the problem first)
 *   --stills=5,12.5          no video: PNGs at those seconds, out/demo/still-<format>-<opening>-<t>.png
 *   --track=<audio> --start=<s>  your own music under it; the file is named -PRIVATE and never committed
 *
 * Writes out/demo/cuepoint-demo-4x5-<opening>[-PRIVATE].mp4, the 16x9 ones, and posters.
 */
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { FORMATS, FPS, SHOTS, layout } from "../demo/shots.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out", "demo");
const FRAMES = join(ROOT, "demo", "frames");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const raw = arg("raw");
const track = arg("track");
const start = Number(arg("start") ?? 0);
const stills = arg("stills")?.split(",").map(Number);
const formats = arg("format") ? [arg("format")] : Object.keys(FORMATS);
const openings = (arg("opening") ?? "a,b,c").split(",");
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

/** Every frame of a shot's clip, once, at 2048 wide: the page picks frames through each shot's speed map. */
function extractRaw(shot) {
  const file = join(raw, `${shot.id}.mkv`);
  if (!existsSync(file)) throw new Error(`No clip ${file}`);
  const dir = join(FRAMES, `raw-${shot.id}`);
  const want = Math.floor(duration(file) * FPS);
  if (count(dir) >= want) return;
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) spawnSync("rm", [join(dir, f)]);
  run(["-i", file, "-vf", `fps=${FPS},scale=2048:-1:flags=lanczos`, "-q:v", "3", join(dir, "%05d.jpg")]);
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
  for (const shot of SHOTS) extractRaw(shot);
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  try {
    for (const [format, opening] of formats.flatMap((f) => openings.map((o) => [f, o]))) {
      const { width, height } = FORMATS[format];
      const page = await browser.newPage({ viewport: { width, height } });
      page.on("pageerror", (e) => console.error("page error:", e.message));
      await page.goto(`${origin}/demo/index.html?format=${format}&opening=${opening}`);
      await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
      const total = await page.evaluate(() => window.__demo.duration);
      const stage = page.locator("#stage");
      if (stills) {
        for (const t of stills) {
          await page.evaluate((s) => window.__demo.seek(s), t);
          await stage.screenshot({ path: join(OUT, `still-${format}-${opening}-${t}.png`) });
        }
        console.log(`${format} ${opening}: ${stills.length} stills`);
        continue;
      }
      const base = join(OUT, `${NAMES[format]}-${opening}`);
      const master = `${base}.master.mkv`;
      const enc = encoder(["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-vf", "scale=out_color_matrix=bt709:out_range=tv", ...BT709, "-c:v", "libx264", "-preset", "medium", "-crf", "10", "-pix_fmt", "yuv444p", master]);
      const frames = Math.round(total * FPS);
      const began = Date.now();
      for (let f = 0; f < frames; f++) {
        await page.evaluate((t) => window.__demo.seek(t), f / FPS);
        const png = await stage.screenshot({ type: "png", animations: "disabled", caret: "hide" });
        if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once("drain", r));
        if (f % 150 === 0) console.log(`${format} ${opening}: frame ${f}/${frames} ${((Date.now() - began) / 1000).toFixed(0)} s`);
      }
      enc.stdin.end();
      await enc.done;
      await page.evaluate(() => window.__demo.seek(window.__demo.open + 6));
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
