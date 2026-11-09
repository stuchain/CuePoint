// Film C, one take: the Clean clip at its own speed from the first click to the last, no cuts, no chrome. The camera
// creeps in while the pointer works the page, pushes into the match dialog as it opens, and the music (Musinova's
// "Minimal Techno Electronic Underscore", 100 BPM) comes back on the first "Use this match". seek(t) draws t seconds.
import { $, FPS, clamp, curve, place, reveal, show, smooth } from "./lib.js";

const BEAT = 60 / 100;
/** Clip seconds the film starts at, and the clip's last frame. */
const FROM = 1.0;
const LAST_FRAME = 711;
/** The first "Use this match" lands at clip 17.93 s (its frame changes there); the music returns on it. */
const CLICK = 17.93 - FROM;
const DURATION = CLICK + 16 * BEAT;

// the camera: a slow creep while the pointer still crosses the whole page, then the push into the dialog
const zoom = curve([[0, 1.0], [12.4, 1.1], [CLICK, 1.544], [DURATION, 1.6]]);
const centreX = curve([[0, 640], [12.4, 640], [CLICK, 865], [DURATION, 880]]);
const W = 1080;
const H = 1350;

let pointer = {};
const pad = (n) => String(n).padStart(5, "0");
const frameAt = (t) => clamp(Math.round((FROM + t) * FPS) + 1, 1, LAST_FRAME);

/** The pointer at t, averaged over a third of a second either side so the light glides rather than jumps. */
function pointerAt(t) {
  const path = pointer.clean ?? [];
  let x = 0;
  let y = 0;
  let n = 0;
  for (let f = frameAt(t - 0.33); f <= frameAt(t + 0.33); f++) {
    const p = path[f - 1];
    if (!p) continue;
    x += p[0];
    y += p[1];
    n++;
  }
  return n ? { x: x / n, y: y / n } : { x: 640, y: 400 };
}

async function seek(t) {
  $("fade").style.opacity = String(Math.max(1 - smooth(t / 0.8), smooth((t - (DURATION - 1.2)) / 1.2)));
  const img = $("clip");
  await show(img, `../demo/frames/raw-clean/${pad(frameAt(t))}.jpg`);
  const z = zoom(t);
  const { scale, left, top } = place(img, W, H, centreX(t), 400, z);

  // a pool of light where the pointer works
  const p = pointerAt(t);
  const px = left + p.x * scale;
  const py = top + p.y * scale;
  $("light").style.background = `radial-gradient(520px 520px at ${px.toFixed(1)}px ${py.toFixed(1)}px, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.26) 100%)`;

  // after the second click the picture settles back and the words come in on the beats
  const words = CLICK + 6 * BEAT;
  $("dim").style.opacity = String(0.62 * smooth((t - (words - 0.6)) / 1.6));
  reveal([...document.querySelectorAll(".words__line, .words__small")], [words, words + BEAT, words + 3 * BEAT], t);
}

pointer = await (await fetch("../demo/pointer.json")).json();
await document.fonts.ready;
window.__film = { seek, duration: DURATION, fps: FPS, poster: CLICK + 0.6 };
document.documentElement.dataset.ready = "1";
