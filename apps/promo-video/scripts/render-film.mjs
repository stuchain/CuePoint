#!/usr/bin/env node
/**
 * `node scripts/render-film.mjs --film=wipe|onetake|slam|grid|tunnel --raw=<dir>`: one of the short LinkedIn films
 * (film/), 1080 x 1350, from what apps/desktop-electron/e2e/capture/demo.spec.ts recorded into <dir>: the wipe film
 * uses its before/after stills (wipe-*-before.png, wipe-*-after.png), the one-take film the Clean clip (clean.mkv),
 * the three fast films (slam, grid, tunnel) all ten clips (slam also the before still of the library).
 *
 *   --stills=5,12.5              no video: PNGs at those seconds, out/film/still-<film>-<t>.png
 *   --track=<audio> --start=<s>  music under it; the file is named -PRIVATE when the track is your own
 *
 * Writes out/film/cuepoint-<film>[-PRIVATE].mp4 and a poster.
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { loudness } from "./audio.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out", "film");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const film = arg("film");
const raw = arg("raw");
const track = arg("track");
const start = Number(arg("start") ?? 0);
const stills = arg("stills")?.split(",").map(Number);
const FPS = 30;
const BT709 = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
/** What each film reads from the recordings. */
const ALL = ["library", "player", "clean", "discover", "prepare", "keys", "statistics", "save", "export", "settings"];
const NEEDS = {
  wipe: { stills: ["wipe-library", "wipe-details"] },
  onetake: { clips: ["clean"] },
  slam: { stills: ["wipe-library"], clips: ALL },
  grid: { clips: ALL },
  tunnel: { clips: ALL },
  "pro-launch": { clips: ALL },
  "pro-case": { stills: ["wipe-library"], clips: ALL },
  "pro-builder": { clips: ALL },
  "pro-evening": { clips: ALL },
  "pro-why": { stills: ["wipe-library"], clips: ALL },
  "pro-showcase": { stills: ["wipe-library"], clips: ALL },
};

function run(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
}
const duration = (file) =>
  Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).stdout.toString());

/** Copy the stills into film/frames, or a clip's frames into demo/frames/raw-<id> (shared with render-demo.mjs). */
function prepare() {
  const need = NEEDS[film];
  if (need.stills) {
    const dir = join(ROOT, "film", "frames");
    mkdirSync(dir, { recursive: true });
    for (const name of need.stills)
      for (const when of ["before", "after"]) {
        const file = join(raw, `${name}-${when}.png`);
        if (!existsSync(file) && existsSync(join(dir, `${name}-${when}.png`))) continue;
        if (!existsSync(file)) throw new Error(`No still ${file}`);
        copyFileSync(file, join(dir, `${name}-${when}.png`));
      }
  }
  for (const clip of need.clips ?? []) {
    const file = join(raw, `${clip}.mkv`);
    if (!existsSync(file)) throw new Error(`No clip ${file}`);
    const dir = join(ROOT, "demo", "frames", `raw-${clip}`);
    const have = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".jpg")).length : 0;
    if (have < Math.floor(duration(file) * FPS)) {
      mkdirSync(dir, { recursive: true });
      for (const f of readdirSync(dir)) spawnSync("rm", [join(dir, f)]);
      run(["-i", file, "-vf", `fps=${FPS},scale=2048:-1:flags=lanczos`, "-q:v", "3", join(dir, "%05d.jpg")]);
    }
  }
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
  if (!NEEDS[film]) throw new Error("--film=<one of NEEDS> is required");
  if (!raw) throw new Error("--raw=<dir of recordings> is required");
  mkdirSync(OUT, { recursive: true });
  prepare();
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    page.on("pageerror", (e) => console.error("page error:", e.message));
    await page.goto(`${origin}/film/${film}.html`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
    const total = await page.evaluate(() => window.__film.duration);
    const stage = page.locator("#stage");
    if (stills) {
      for (const t of stills) {
        await page.evaluate((s) => window.__film.seek(s), t);
        await stage.screenshot({ path: join(OUT, `still-${film}-${t}.png`) });
      }
      console.log(`${film}: ${stills.length} stills`);
      return;
    }
    const base = join(OUT, `cuepoint-${film}`);
    const master = `${base}.master.mkv`;
    const enc = encoder(["-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-", "-vf", "scale=out_color_matrix=bt709:out_range=tv", ...BT709, "-c:v", "libx264", "-preset", "medium", "-crf", "10", "-pix_fmt", "yuv444p", master]);
    const frames = Math.round(total * FPS);
    const began = Date.now();
    for (let f = 0; f < frames; f++) {
      await page.evaluate((t) => window.__film.seek(t), f / FPS);
      const png = await stage.screenshot({ type: "png", animations: "disabled", caret: "hide" });
      if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once("drain", r));
      if (f % 150 === 0) console.log(`${film}: frame ${f}/${frames} ${((Date.now() - began) / 1000).toFixed(0)} s`);
    }
    enc.stdin.end();
    await enc.done;
    await page.evaluate(() => window.__film.seek(window.__film.poster ?? 8));
    await stage.screenshot({ path: `${base}-poster.png` });
    const fade = 1.5;
    const audio = track
      ? ["-ss", String(start), "-t", String(total), "-i", track, "-map", "0:v", "-map", "1:a", "-af", `afade=t=in:d=0.05,afade=t=out:st=${(total - fade).toFixed(3)}:d=${fade},${loudness(track, start, total)}`, "-ar", "48000", "-c:a", "aac", "-b:a", "256k"]
      : [];
    const out = `${base}${track ? "-PRIVATE" : ""}.mp4`;
    run(["-i", master, ...audio, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", ...BT709, "-t", String(total), "-movflags", "+faststart", out]);
    console.log(out);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
