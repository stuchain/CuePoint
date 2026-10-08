#!/usr/bin/env node
/**
 * `npm run mux -- --track=<audio file> --start=<seconds> --bpm=<the track's tempo>`: puts a piece of
 * your own copy of a track under the rendered picture, for a private cut. Run `npm run render` first;
 * this reads its masters in out/.
 *
 * The piece starts at --start and is stretched (without changing its pitch much) from the track's tempo
 * to the promo's 128 BPM, so its bars land on the cuts. Start it a whole number of bars before a drop
 * and the drop lands on a cut. The output is named -PRIVATE: commercial music needs a license to post,
 * and the track never goes in the repository.
 *
 *   out/cuepoint-promo-16x9-PRIVATE.mp4, out/cuepoint-promo-9x16-PRIVATE.mp4
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BPM, DURATION } from "../src/timing.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const track = arg("track");
const start = Number(arg("start") ?? 0);
const bpm = Number(arg("bpm") ?? BPM);
if (!track || !existsSync(track)) throw new Error("--track=<audio file> is required");
if (!(start >= 0) || !(bpm >= 60 && bpm <= 200)) throw new Error("--start must be seconds and --bpm a tempo");
// atempo runs at tempo/BPM: read that much of the track so it lasts exactly the video
const tempo = BPM / bpm;
const length = DURATION / tempo;
const FADE = 1.5;
const filter = `atempo=${tempo.toFixed(6)},afade=t=in:d=0.05,afade=t=out:st=${(DURATION - FADE).toFixed(3)}:d=${FADE},loudnorm=I=-14:TP=-1.5:LRA=11`;

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

for (const name of ["cuepoint-promo-16x9", "cuepoint-promo-9x16"]) {
  const master = join(OUT, `${name}.master.mkv`);
  if (!existsSync(master)) throw new Error(`No ${master}: run \`npm run render\` first`);
  const out = join(OUT, `${name}-PRIVATE.mp4`);
  await ffmpeg([
    "-i", master,
    "-ss", start.toFixed(3), "-t", length.toFixed(3), "-i", track,
    "-map", "0:v", "-map", "1:a", "-af", filter, "-ar", "48000",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-tune", "animation", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "192k", "-t", String(DURATION), "-movflags", "+faststart", out,
  ]);
  console.log(out);
}
