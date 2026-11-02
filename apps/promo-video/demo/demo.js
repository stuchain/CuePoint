// The demo's timeline: seek(t) draws the frame at t seconds. Driven frame by frame by scripts/render-demo.mjs.
import { BAR, FPS, OPEN, END, SHOTS, FORMATS } from "./shots.js";

const params = new URLSearchParams(location.search);
const format = params.get("format") === "wide" ? "wide" : "portrait";
const { width, height } = FORMATS[format];
const stage = document.getElementById("stage");
stage.classList.add(`f-${format}`);
Object.assign(stage.style, { width: `${width}px`, height: `${height}px` });

// the timeline: opening, one slot per shot (whole bars of the music), the end card
const slots = [];
let t0 = OPEN.seconds;
for (const shot of SHOTS) {
  const d = shot.bars * BAR;
  slots.push({ ...shot, start: t0, dur: d });
  t0 += d;
}
const endStart = t0;
const DURATION = endStart + END.seconds;

const rail = document.getElementById("rail");
for (const shot of SHOTS) {
  const li = document.createElement("li");
  li.textContent = shot.chip;
  rail.appendChild(li);
}
const $ = (id) => document.getElementById(id);
const clip = $("clip");
const full = $("full");
const fullImg = $("fullImg");

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Camera at progress p (0..1 of the slot): keyframes [p, x, y, zoom], x/y the window point to centre. */
function camera(cam, p) {
  if (!cam?.length) return { x: 640, y: 400, z: 1 };
  if (p <= cam[0][0]) return { x: cam[0][1], y: cam[0][2], z: cam[0][3] };
  for (let i = 1; i < cam.length; i++) {
    const [p1, x1, y1, z1] = cam[i];
    const [p0, x0, y0, z0] = cam[i - 1];
    if (p <= p1) {
      const k = ease((p - p0) / (p1 - p0));
      return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, z: z0 + (z1 - z0) * k };
    }
  }
  const last = cam[cam.length - 1];
  return { x: last[1], y: last[2], z: last[3] };
}

async function show(img, src) {
  if (img.getAttribute("src") === src) return;
  img.setAttribute("src", src);
  await img.decode().catch(() => undefined);
}

const pad = (n) => String(n).padStart(5, "0");
let lastCaption = -1;

async function seek(t) {
  const fade = $("fade");
  if (t < OPEN.seconds || t >= endStart) {
    const inEnd = t >= endStart;
    const src = inEnd ? END : OPEN;
    const local = inEnd ? t - endStart : t;
    const n = Math.min(src.frames - 1, Math.floor(local * FPS));
    full.style.display = "block";
    await show(fullImg, `frames/${src.id}-${format}/${pad(n + 1)}.jpg`);
    // fade in from black at the start, out at the end
    const out = inEnd ? clamp((local - (END.seconds - 0.8)) / 0.8, 0, 1) : 0;
    fade.style.opacity = String(out);
    return;
  }
  full.style.display = "none";
  fade.style.opacity = "0";
  const i = slots.findIndex((s) => t >= s.start && t < s.start + s.dur);
  const slot = slots[i];
  const local = t - slot.start;
  const p = local / slot.dur;

  if (i !== lastCaption) {
    $("chip").textContent = slot.chip;
    $("caption").textContent = slot.caption;
    $("count").textContent = `${String(i + 1).padStart(2, "0")} / ${String(slots.length).padStart(2, "0")}`;
    [...rail.children].forEach((li, j) => (li.className = j < i ? "done" : j === i ? "now" : ""));
    lastCaption = i;
  }
  // caption steps in over the first 0.3 s: four pixel steps up, as the app's motion does
  const enter = clamp(local / 0.3, 0, 1);
  const step = Math.floor(enter * 4) / 4;
  const box = document.querySelector(".captionBox");
  box.style.opacity = String(step === 0 ? 0.15 : step);
  box.style.transform = `translateY(${(1 - step) * 18}px)`;

  const n = Math.min(slot.frames - 1, Math.floor(local * FPS));
  await show(clip, `frames/${slot.id}/${pad(n + 1)}.jpg`);
  const win = $("window");
  const W = win.clientWidth;
  const H = win.clientHeight;
  const cam = camera(slot.cam, p);
  const z = Math.max(1, cam.z);
  const scale = (W / 1280) * z;
  const iw = 1280 * scale;
  const ih = 800 * scale;
  const left = clamp(W / 2 - cam.x * scale, W - iw, 0);
  const top = clamp(H / 2 - cam.y * scale, H - ih, 0);
  clip.style.width = `${iw}px`;
  clip.style.height = `${ih}px`;
  clip.style.transform = `translate(${left}px, ${top}px)`;
}

await document.fonts.ready;
window.__demo = { seek, duration: DURATION, fps: FPS, slots: slots.map(({ id, start, dur }) => ({ id, start, dur })) };
document.documentElement.dataset.ready = "1";
