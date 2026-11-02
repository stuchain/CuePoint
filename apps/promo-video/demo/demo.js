// The demo's timeline: seek(t) draws the frame at t seconds. Driven frame by frame by scripts/render-demo.mjs.
import { FPS, OPEN, END, SHOTS, FORMATS, SHOT_FADE } from "./shots.js";

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
  const d = shot.frames / FPS;
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
const prev = $("prev");
const full = $("full");
const fullImg = $("fullImg");
const fade = $("fade");
const win = $("window");
const capNow = $("capNow");
const capPrev = $("capPrev");

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// smootherstep: starts and stops with no jolt
const smooth = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * k * (k * (k * 6 - 15) + 10);
};
const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 3;

/** Camera at s seconds into the shot: keyframes [s, x, y, zoom], x/y the window point to centre. */
function camera(cam, s) {
  if (s <= cam[0][0]) return { x: cam[0][1], y: cam[0][2], z: cam[0][3] };
  for (let i = 1; i < cam.length; i++) {
    const [s1, x1, y1, z1] = cam[i];
    const [s0, x0, y0, z0] = cam[i - 1];
    if (s <= s1) {
      const k = smooth((s - s0) / Math.max(1e-6, s1 - s0));
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

/** One frame of a shot (n may run into its tail) into img, framed by the camera at s seconds. */
async function frame(img, slot, n, s) {
  await show(img, `frames/${slot.id}/${pad(n + 1)}.jpg`);
  const W = win.clientWidth;
  const H = win.clientHeight;
  const cam = camera(slot.camAt, s);
  const scale = (W / 1280) * Math.max(1, cam.z);
  const iw = 1280 * scale;
  const ih = 800 * scale;
  const left = clamp(W / 2 - cam.x * scale, W - iw, 0);
  const top = clamp(H / 2 - cam.y * scale, H - ih, 0);
  Object.assign(img.style, { width: `${iw}px`, height: `${ih}px`, transform: `translate(${left}px, ${top}px)` });
}

function caption(box, slot) {
  if (box.dataset.id === slot.id) return;
  box.dataset.id = slot.id;
  box.querySelector(".chip").textContent = slot.chip;
  box.querySelector(".caption").textContent = slot.caption;
}

let lastRail = -1;
function setRail(i) {
  if (i === lastRail) return;
  $("count").textContent = `${String(i + 1).padStart(2, "0")} / ${String(slots.length).padStart(2, "0")}`;
  [...rail.children].forEach((li, j) => (li.className = j < i ? "done" : j === i ? "now" : ""));
  lastRail = i;
}

async function fullFrame(part, n, opacity) {
  full.style.display = opacity > 0 ? "block" : "none";
  full.style.opacity = String(opacity);
  if (opacity > 0) await show(fullImg, `frames/${part.id}-${format}/${pad(clamp(n, 0, part.frames - 1) + 1)}.jpg`);
}

async function seek(t) {
  if (t < OPEN.seconds) {
    fade.style.opacity = "0";
    await fullFrame(OPEN, Math.floor(t * FPS), 1);
    return;
  }
  if (t >= endStart) {
    // the last shot plays on under the end card as it fades in, then the end card fades to black
    const local = t - endStart;
    const last = slots[slots.length - 1];
    const n = Math.floor(local * FPS);
    setRail(slots.length - 1);
    caption(capNow, last);
    Object.assign(capNow.style, { opacity: "1", transform: "none" });
    capPrev.style.display = "none";
    if (local < SHOT_FADE) await frame(clip, last, last.frames + n, last.dur + local);
    prev.style.opacity = "0";
    await fullFrame(END, n, smooth(local / SHOT_FADE));
    fade.style.opacity = String(clamp((local - (END.seconds - 0.9)) / 0.9, 0, 1));
    return;
  }
  fade.style.opacity = "0";
  const i = slots.findIndex((s) => t >= s.start && t < s.start + s.dur);
  const slot = slots[i];
  const local = t - slot.start;
  const n = Math.floor(local * FPS);
  setRail(i);
  await frame(clip, slot, n, local);

  // the cut is a dissolve: the shot before (or the opening) keeps playing on top and fades out
  const k = local / SHOT_FADE;
  if (k < 1 && i > 0) {
    const before = slots[i - 1];
    prev.style.display = "block";
    prev.style.opacity = String(1 - smooth(k));
    await frame(prev, before, before.frames + n, before.dur + local);
  } else {
    prev.style.display = "none";
  }
  await fullFrame(OPEN, OPEN.frames - 1, i === 0 && k < 1 ? 1 - smooth(k) : 0);

  // captions: the old one fades away as the new one glides up into place
  caption(capNow, slot);
  const enter = (local - 0.08) / 0.55;
  capNow.style.opacity = String(smooth(enter));
  capNow.style.transform = `translateY(${(1 - easeOut(enter)) * 22}px)`;
  if (i > 0 && local < 0.3) {
    caption(capPrev, slots[i - 1]);
    capPrev.style.display = "block";
    capPrev.style.opacity = String(1 - smooth(local / 0.25));
  } else {
    capPrev.style.display = "none";
  }
}

await document.fonts.ready;
window.__demo = { seek, duration: DURATION, fps: FPS, slots: slots.map(({ id, start, dur }) => ({ id, start, dur })) };
document.documentElement.dataset.ready = "1";
