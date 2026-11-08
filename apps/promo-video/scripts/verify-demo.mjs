#!/usr/bin/env node
/**
 * `node scripts/verify-demo.mjs`: checks the demo's camera plan (demo/shots.js) against the tracked pointer
 * (demo/pointer.json, written by scripts/track-pointer.py from the extracted raw frames): during every kept
 * moment the mouse must sit inside the visible part of the window with a margin, and no camera move may take
 * under 1.6 s. Prints the first offenders per shot, for both the A and the B/C layouts.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FPS, layout } from "../demo/shots.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = JSON.parse(readFileSync(join(ROOT, "demo", "pointer.json"), "utf8"));
const MARGIN = 30;
const MIN_MOVE = 1.59;
/** The short edit moves its camera on the click, over exactly its `move` second (see SHORT in shots.js). */
const MIN_MOVE_SHORT = 0.99;
const smooth = (x) => {
  const k = Math.max(0, Math.min(1, x));
  return k * k * k * (k * (k * 6 - 15) + 10);
};
function camera(cam, s) {
  if (s <= cam[0][0]) return cam[0].slice(1);
  for (let i = 1; i < cam.length; i++) {
    if (s <= cam[i][0]) {
      const k = smooth((s - cam[i - 1][0]) / (cam[i][0] - cam[i - 1][0]));
      return [1, 2, 3].map((j) => cam[i - 1][j] + (cam[i][j] - cam[i - 1][j]) * k);
    }
  }
  return cam[cam.length - 1].slice(1);
}

let failed = false;
for (const [opening, edit] of [["a", "full"], ["b", "full"], ["c", "story"], ["c", "short"], ["c", "underscore"]]) {
  console.log(`opening ${opening}, ${edit} edit`);
  for (const s of layout(opening, edit).shots) {
    const cam = opening === "a" && s.camA ? s.camA : s.cam;
    const bad = [];
    let peak = 0;
    let prevRect = null;
    for (let f = -Math.round(s.lead * FPS); f < s.frames + 13; f++) {
      const o = f / FPS;
      const c = s.map.toClip(o);
      const [x, y, z] = camera(cam, o);
      const vw = 1280 / z;
      const vh = 800 / z;
      const left = Math.max(0, Math.min(1280 - vw, x - vw / 2));
      const top = Math.max(0, Math.min(800 - vh, y - vh / 2));
      const p = P[s.id][Math.min(P[s.id].length - 1, Math.max(0, Math.round(c * FPS)))];
      const inKeep = s.keep.some(([a, b]) => c >= a - 0.1 && c <= b + 0.1);
      const out = p[0] < left + MARGIN || p[0] > left + vw - MARGIN || p[1] < top + MARGIN || p[1] > top + vh - MARGIN;
      if (inKeep && out) bad.push(`pointer (${p[0]},${p[1]}) outside view x${left.toFixed(0)}-${(left + vw).toFixed(0)} y${top.toFixed(0)}-${(top + vh).toFixed(0)}`);
      if (prevRect) peak = Math.max(peak, Math.hypot(left - prevRect[0], top - prevRect[1]) * FPS * (1000 / vw));
      prevRect = [left, top];
    }
    for (let i = 1; i < cam.length; i++) {
      const d = cam[i][0] - cam[i - 1][0];
      const moved = Math.abs(cam[i][3] - cam[i - 1][3]) > 0.02 || Math.hypot(cam[i][1] - cam[i - 1][1], cam[i][2] - cam[i - 1][2]) > 20;
      if (moved && d < (edit === "short" || edit === "underscore" ? MIN_MOVE_SHORT : MIN_MOVE)) bad.push(`camera move ${i} only ${d.toFixed(2)} s`);
    }
    const unique = [...new Set(bad)];
    if (unique.length) failed = true;
    console.log(`  ${s.id.padEnd(11)} pace x${s.map.F.toFixed(2)}, peak pan ${peak.toFixed(0)} px/s${unique.length ? "\n    " + unique.slice(0, 4).join("\n    ") : " ok"}`);
  }
}
process.exit(failed ? 1 : 0);
