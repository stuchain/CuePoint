// The demo's timeline: seek(t) draws the frame at t seconds. Driven frame by frame by scripts/render-demo.mjs.
import { BAR, FPS, FORMATS, SHOT_FADE, layout } from "./shots.js";

const BEAT = BAR / 4;

const params = new URLSearchParams(location.search);
const format = params.get("format") === "wide" ? "wide" : "portrait";
const opening = ["a", "b", "c"].includes(params.get("opening")) ? params.get("opening") : "c";
const { width, height } = FORMATS[format];
const stage = document.getElementById("stage");
stage.classList.add(`f-${format}`);
Object.assign(stage.style, { width: `${width}px`, height: `${height}px` });

// the timeline: opening, one slot per shot (whole bars of the music), the end card
const { OPEN, END, shots: slots, endStart, duration: DURATION } = layout(opening);

const $ = (id) => document.getElementById(id);
const rail = $("rail");
for (const shot of slots) {
  const li = document.createElement("li");
  li.textContent = shot.chip;
  rail.appendChild(li);
}
const clip = $("clip");
const prev = $("prev");
const fade = $("fade");
const win = $("window");
const capNow = $("capNow");
const capPrev = $("capPrev");
const cards = { a: $("openA"), b: $("openB"), c: $("openC") };
const openCardEl = cards[opening];
const end = $("end");

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// smootherstep: starts and stops with no jolt
const smooth = (x) => {
  const k = clamp(x, 0, 1);
  return k * k * k * (k * (k * 6 - 15) + 10);
};
const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 3;
const lerp = (a, b, k) => a + (b - a) * k;
const mix = (c1, c2, k) => `rgb(${c1.map((v, i) => Math.round(lerp(v, c2[i], k))).join(",")})`;

/** Camera at s seconds into the shot: keyframes [s, x, y, zoom], x/y the window point to centre. */
function camera(cam, s) {
  if (s <= cam[0][0]) return { x: cam[0][1], y: cam[0][2], z: cam[0][3] };
  for (let i = 1; i < cam.length; i++) {
    const [s1, x1, y1, z1] = cam[i];
    const [s0, x0, y0, z0] = cam[i - 1];
    if (s <= s1) {
      const k = smooth((s - s0) / Math.max(1e-6, s1 - s0));
      return { x: lerp(x0, x1, k), y: lerp(y0, y1, k), z: lerp(z0, z1, k) };
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
/** The raw frame a shot shows at s output seconds (negative during a lead-in), through its speed map. */
const rawSrc = (slot, s) => `frames/raw-${slot.id}/${pad(Math.max(0, Math.round(slot.map.toClip(s) * FPS)) + 1)}.jpg`;
const camOf = (slot) => (opening === "a" && slot.camA ? slot.camA : slot.cam);

/** One frame of a shot into img, framed by the camera at s seconds. */
async function frame(img, slot, s) {
  await show(img, rawSrc(slot, s));
  const W = win.clientWidth;
  const H = win.clientHeight;
  const cam = camera(camOf(slot), s);
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

const GREY = { bg: [20, 20, 23], fg: [109, 109, 120], border: [58, 58, 66] };
const DONE = { bg: [20, 20, 23], fg: [170, 170, 178], border: [74, 74, 85] };
const NOW = { bg: [145, 100, 246], fg: [0, 0, 0], border: [0, 0, 0] };
const paint = (li, from, to, k, shadow) => {
  li.style.background = mix(from.bg, to.bg, k);
  li.style.color = mix(from.fg, to.fg, k);
  li.style.borderColor = mix(from.border, to.border, k);
  li.style.boxShadow = `4px 4px 0 rgba(9, 9, 11, ${shadow.toFixed(3)})`;
};
/** The rail and counter at slot i, k seconds in: the chip before hands over to this one over the dissolve. */
function chrome(i, k) {
  const h = smooth(k / SHOT_FADE);
  [...rail.children].forEach((li, j) => {
    li.className = "";
    if (j === i) paint(li, i > 0 ? GREY : NOW, NOW, h, h);
    else if (j === i - 1) paint(li, NOW, DONE, h, 1 - h);
    else paint(li, j < i ? DONE : GREY, j < i ? DONE : GREY, 1, 0);
  });
  const count = $("count");
  const text = `${String(i + 1).padStart(2, "0")} / ${String(slots.length).padStart(2, "0")}`;
  const dip = i > 0 ? Math.abs(h - 0.5) * 2 : 1;
  count.textContent = i > 0 && h < 0.5 ? `${String(i).padStart(2, "0")} / ${String(slots.length).padStart(2, "0")}` : text;
  count.style.opacity = String(0.2 + 0.8 * dip);
}

/** A title card's lines come in one after another: each rises into place over 0.5 s from its own start. */
function reveal(card, starts, t) {
  [...card.querySelectorAll(".card__body > *")].forEach((el, i) => {
    const k = (t - starts[i]) / 0.5;
    el.style.opacity = String(smooth(k));
    el.style.transform = `translateY(${(1 - easeOut(k)) * 28}px)`;
  });
}

const setChrome = (opacity) => [...document.querySelectorAll(".chrome")].forEach((el) => (el.style.opacity = String(opacity)));
const rectOf = (el) => {
  const r = el.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  return { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height };
};

/** Opening A: the Library runs full-frame under the name, then one slow pull back seats it in its window. */
async function openA(t) {
  const slot = slots[0];
  const app = $("openApp");
  await show(app, rawSrc(slot, t - OPEN.seconds));
  // where the window will be, and the frame that covers the whole stage
  const w = rectOf(win);
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const cover = Math.max(W / 1280, H / 800) * 1.04;
  const full = { width: 1280 * cover, height: 800 * cover };
  full.left = (W - full.width) / 2;
  full.top = (H - full.height) / 2;
  // the window shows the camera's framing at the slot's first frame: match it so nothing shifts at the handover
  const cam = camera(camOf(slot), 0);
  const scale = (w.width / 1280) * Math.max(1, cam.z);
  const seat = { width: 1280 * scale, height: 800 * scale };
  seat.left = w.left + clamp(w.width / 2 - cam.x * scale, w.width - seat.width, 0);
  seat.top = w.top + clamp(w.height / 2 - cam.y * scale, w.height - seat.height, 0);
  const pull = smooth((t - (OPEN.seconds - 1.9)) / 1.9);
  const r = {};
  for (const key of ["left", "top", "width", "height"]) r[key] = lerp(full[key], seat[key], pull);
  Object.assign(app.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  // the window's own frame clips the seated picture exactly like #window does
  const clipL = Math.max(0, w.left - r.left);
  const clipT = Math.max(0, w.top - r.top);
  const clipR = Math.max(0, r.left + r.width - (w.left + w.width));
  const clipB = Math.max(0, r.top + r.height - (w.top + w.height));
  app.style.clipPath = pull > 0 ? `inset(${clipT}px ${clipR}px ${clipB}px ${clipL}px)` : "none";
  app.style.borderWidth = `${4 * pull}px`;
  $("openDim").style.opacity = String(1 - pull);
  reveal($("openABody"), [0.3, 0.7, 1.3], t);
  const leave = smooth((t - (OPEN.seconds - 2.6)) / 0.7);
  $("openABody").style.opacity = String(1 - leave);
  setChrome(pull);
}

/** Opening B: the wheel builds up row by row, the name and line follow, then they glide to the brand corner. */
function openB(t) {
  const icon = $("buildIcon");
  const name = $("buildName");
  const line = $("buildLine");
  const rows = clamp(Math.floor(((t - 0.25) / 0.95) * 16), 0, 16);
  reveal($("openB").querySelector(".card__body"), [-9, 1.3, 1.9], t);
  icon.style.opacity = t > 0.25 ? "1" : "0";
  icon.style.clipPath = `inset(${(100 * (16 - rows)) / 16}% 0 0 0)`;
  const glide = smooth((t - (OPEN.seconds - 1.6)) / 1.3);
  if (glide > 0) {
    icon.style.clipPath = "none";
    const bi = rectOf($("brandIcon"));
    const bn = rectOf($("brandName"));
    for (const [el, target] of [[icon, bi], [name, bn]]) {
      el.style.transform = "none";
      const from = rectOf(el);
      const sx = target.width / from.width;
      const dx = target.left - from.left;
      const dy = target.top - from.top;
      el.style.transformOrigin = "0 0";
      el.style.transform = `translate(${(dx * glide).toFixed(2)}px, ${(dy * glide).toFixed(2)}px) scale(${lerp(1, sx, glide).toFixed(4)})`;
    }
    line.style.opacity = String(1 - smooth(glide * 2));
  }
  $("openB").style.background = glide > 0 ? `rgba(24, 24, 27, ${(1 - glide).toFixed(3)})` : "";
  setChrome(glide);
  $("brand").style.opacity = String(glide > 0.98 ? 1 : 0);
}

/** Opening C: the problem, a line every two beats, then the answer on the bar line three bars in. */
function openC(t) {
  const body = $("openC").querySelector(".card__body");
  reveal(body, [0.2 + BEAT, 0.2 + 3 * BEAT, 0.2 + 5 * BEAT, 0.2 + 7 * BEAT, 0.2 + 12 * BEAT], t);
  const dim = smooth((t - (0.2 + 11 * BEAT)) / 0.45);
  [...body.querySelectorAll(".card__problem")].forEach((el) => (el.style.color = mix([250, 250, 250], [91, 91, 102], dim)));
  setChrome(1);
}

async function openingAt(t, opacity) {
  for (const key of Object.keys(cards)) cards[key].style.display = key === opening && opacity > 0 ? "block" : "none";
  openCardEl.style.opacity = String(opacity);
  if (opacity <= 0) return;
  if (opening === "a") await openA(t);
  else if (opening === "b") openB(t);
  else openC(t);
}

/** The end card: the last shot dissolves out under it, its lines come in, then it fades to black. */
function endCard(t, opacity) {
  end.style.display = opacity > 0 ? "block" : "none";
  end.style.opacity = String(opacity);
  if (opacity > 0) reveal(end, [0, 1, 2, 3, 4, 5].map((b) => b * BEAT), t);
}

async function seek(t) {
  if (t < OPEN.seconds) {
    fade.style.opacity = String(1 - smooth(t / 0.6));
    endCard(0, 0);
    // under the opening the layout waits on the first shot's first frame (A draws the live frame itself)
    chrome(0, SHOT_FADE);
    caption(capNow, slots[0]);
    capNow.style.opacity = "0";
    capPrev.style.display = "none";
    prev.style.display = "none";
    await frame(clip, slots[0], opening === "a" ? t - OPEN.seconds : 0);
    await openingAt(t, 1);
    return;
  }
  setChrome(1);
  if (t >= endStart) {
    // the last shot plays on under the end card as it fades in, then the end card fades to black
    const local = t - endStart;
    const last = slots[slots.length - 1];
    chrome(slots.length - 1, SHOT_FADE);
    caption(capNow, last);
    Object.assign(capNow.style, { opacity: "1", transform: "none" });
    capPrev.style.display = "none";
    if (local < SHOT_FADE) await frame(clip, last, last.dur + local);
    prev.style.opacity = "0";
    await openingAt(0, 0);
    endCard(local, smooth(local / SHOT_FADE));
    fade.style.opacity = String(clamp((local - (END.seconds - 0.9)) / 0.9, 0, 1));
    return;
  }
  fade.style.opacity = "0";
  const i = slots.findIndex((s) => t >= s.start && t < s.start + s.dur);
  const slot = slots[i];
  const local = t - slot.start;
  chrome(i, local);
  await frame(clip, slot, local);

  // the cut is a dissolve: the shot before keeps playing on top and fades out
  const k = local / SHOT_FADE;
  if (k < 1 && i > 0) {
    const before = slots[i - 1];
    prev.style.display = "block";
    prev.style.opacity = String(1 - smooth(k));
    await frame(prev, before, before.dur + local);
  } else {
    prev.style.display = "none";
  }
  endCard(0, 0);
  // opening A has already seated the picture in the window: it just lifts off; B and C dissolve away
  await openingAt(OPEN.seconds + local, i === 0 && k < 1 && opening !== "a" ? 1 - smooth(k) : 0);

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
window.__demo = { seek, duration: DURATION, fps: FPS, open: OPEN.seconds, slots: slots.map(({ id, start, dur }) => ({ id, start, dur })) };
document.documentElement.dataset.ready = "1";
