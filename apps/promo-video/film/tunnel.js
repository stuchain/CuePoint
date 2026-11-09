// Fast film 3, tunnel (sub_clair's "Technology", 125 BPM, from 89.81 s, the track at full tilt): the name glitches in,
// then the camera dives through the app. Each window plays its moment for two beats, the next window opens inside it
// as a portal, and the camera rushes through on beats 3 and 4 and lands with an RGB-split glitch, ten times. Then it
// pulls back to a wall of all ten playing at once, lights them one by one, and glitches out to the end card.
// seek(t) draws t seconds.
import { $, FPS, clamp, easeOut, lerp, smooth } from "./lib.js";
import { FEATURES, featureSrc, image, kick } from "./fast.js";

const BEAT = 60 / 125;
const B = (n) => n * BEAT;
const W = 1080;
const H = 1350;
const DURATION = B(64);
const TUNNEL = B(4);
const PER = B(4);
const WALL = TUNNEL + FEATURES.length * PER;
const ENDS = B(56);
/** How much smaller a window inside a window is. */
const K = 5;
const S0 = W / 1280;
const C = [W / 2, H / 2];
const easeIn = (x) => clamp(x, 0, 1) ** 3;

const cv = $("cv");
const ctx = cv.getContext("2d");
const make = () => {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
};
const scene = make();
const sx = scene.getContext("2d");
const channels = ["#ff0000", "#00ff00", "#0000ff"].map((colour) => ({ c: make(), colour }));

/** How far into its dive a feature is, by beats: it holds for two beats, then rushes through the portal. */
function dive(u) {
  const b = u / BEAT;
  if (b < 2) return 0.06 * (Math.floor(b) + easeOut(b % 1));
  if (b < 3) return 0.12 + 0.2 * easeOut(b - 2);
  return 0.32 + 0.68 * easeIn(b - 3) ** 0.8;
}

function frameRand(t, k) {
  const x = Math.sin((Math.floor(t * FPS) + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A window picture at origin (ox, oy) and scale s (stage px per window px), with a frame round it. */
function win(g, img, ox, oy, s, { glow = 0, alpha = 1 } = {}) {
  g.globalAlpha = alpha;
  g.drawImage(img, ox, oy, 1280 * s, 800 * s);
  g.globalAlpha = 1;
  if (glow > 0) {
    g.save();
    g.shadowColor = "rgba(145, 100, 246, 1)";
    g.shadowBlur = 50 * glow;
    g.strokeStyle = `rgba(190, 160, 255, ${glow})`;
    g.lineWidth = Math.max(2, 6 * glow);
    g.strokeRect(ox, oy, 1280 * s, 800 * s);
    g.restore();
  }
}

function backdrop(g, t) {
  g.fillStyle = "#07060b";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = `rgba(145, 100, 246, ${0.18 + 0.25 * kick(t, BEAT)})`;
  g.lineWidth = 2;
  const off = (t * 140) % 90;
  for (let x = -90 + off; x < W + 90; x += 90) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }
  for (let y = -90 + off; y < H + 90; y += 90) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
}

/** Lines streaking out from the middle while the camera rushes. */
function speedLines(g, t, amount) {
  if (amount <= 0.02) return;
  g.save();
  g.translate(C[0], C[1]);
  for (let k = 0; k < 70; k++) {
    const a = frameRand(0, k) * Math.PI * 2;
    const r0 = 260 + frameRand(t, k) * 400;
    const len = 200 + 500 * amount * frameRand(t, k + 99);
    g.strokeStyle = `rgba(255, 255, 255, ${(0.55 * amount * frameRand(0, k + 7)).toFixed(3)})`;
    g.lineWidth = 2 + 3 * frameRand(0, k + 3);
    g.beginPath();
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len));
    g.stroke();
  }
  g.restore();
}

/** The feature's word flying at the camera, and its line typed out at the bottom. */
function words(g, f, u) {
  const k = u / PER;
  const s = 0.45 + 2.2 * easeIn(k) + 0.3 * k;
  const a = smooth(u / 0.08) * (1 - smooth((k - 0.7) / 0.3));
  g.save();
  g.translate(C[0], C[1] - 40);
  g.scale(s, s);
  g.font = "900 230px 'Inter Variable'";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 7 / s + 2;
  g.strokeStyle = `rgba(255, 255, 255, ${a})`;
  g.fillStyle = `rgba(145, 100, 246, ${0.35 * a})`;
  g.fillText(f.word, 0, 0);
  g.strokeText(f.word, 0, 0);
  g.restore();
  const n = Math.floor(clamp((u - 0.05) / 0.012, 0, f.line.length));
  if (n > 0 && u < PER - 0.15) {
    const text = f.line.slice(0, n);
    g.font = "700 44px 'Pixelify Sans'";
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    const w = g.measureText(text).width;
    g.fillStyle = "#000";
    g.fillRect(40, H - 170, w + 40, 70);
    g.fillStyle = "#9164f6";
    g.fillRect(40, H - 170, 10, 70);
    g.fillStyle = "#fff";
    g.fillText(text, 64, H - 120);
  }
}

async function tunnel(g, t) {
  const n = clamp(Math.floor((t - TUNNEL) / PER), 0, FEATURES.length - 1);
  const u = t - TUNNEL - n * PER;
  const last = n === FEATURES.length - 1;
  const f = last ? Math.min(0.12, dive(u)) : dive(u);
  const fe = FEATURES[n];
  const c = fe.focus;
  const S = S0 * K ** f;
  const P0 = [C[0] + (c[0] - 640) * S0, C[1] + (c[1] - 400) * S0];
  const P = [lerp(P0[0], C[0], f), lerp(P0[1], C[1], f)];
  const O = [P[0] - c[0] * S, P[1] - c[1] * S];
  // the window this one opened from, round it
  if (n > 0) {
    const pc = FEATURES[n - 1].focus;
    const Sp = S * K;
    const centre = [O[0] + 640 * S, O[1] + 400 * S];
    const img = await image(featureSrc(FEATURES[n - 1], PER + u));
    win(g, img, centre[0] - pc[0] * Sp, centre[1] - pc[1] * Sp, Sp);
    g.fillStyle = "rgba(0, 0, 0, 0.35)";
    g.fillRect(0, 0, W, H);
  }
  win(g, await image(featureSrc(fe, u)), O[0], O[1], S, { glow: n > 0 ? 0.5 * (1 - f) : 0 });
  // the next window opens as a portal on beat 2
  if (!last) {
    const q = easeOut((u - B(2)) / 0.3) * (1 + 0.15 * Math.exp(-Math.max(0, u - B(2) - 0.3) / 0.1));
    if (u > B(2)) {
      const s = (S / K) * Math.min(q, 1.12);
      const nx = FEATURES[n + 1];
      win(g, await image(featureSrc(nx, 0)), P[0] - 640 * s, P[1] - 400 * s, s, { glow: 1 });
    }
  }
  speedLines(g, t, u > B(3) && !last ? easeIn((u - B(3)) / BEAT) : 0);
  words(g, fe, u);
}

async function intro(g, t) {
  // the name glitches in on the beats; the first window grows out of the middle on beat 3 and the camera dives in
  const grow = easeIn((t - B(2)) / B(2));
  g.save();
  g.translate(C[0], C[1]);
  const s = 1 + 3 * easeIn((t - B(3)) / BEAT);
  g.scale(s, s);
  g.font = "700 180px 'Pixelify Sans'";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = `rgba(255, 255, 255, ${(1 - smooth((t - B(3.3)) / B(0.6))).toFixed(3)})`;
  g.shadowColor = "#9164f6";
  g.shadowBlur = 40;
  g.fillText("CuePoint", 0, -260 / s);
  g.restore();
  if (t > B(1.5)) {
    const ws = lerp(0.15, 1, grow) * S0 * (1 + 0.04 * kick(t, BEAT));
    win(g, await image(featureSrc(FEATURES[0], 0)), C[0] - 640 * ws, C[1] - 400 * ws + 120 * (1 - grow), ws, { glow: 1 - grow });
  }
}

/** The wall: two columns of five, tilted. */
const wallPos = (k) => [(k % 2) * 520 - 260, Math.floor(k / 2) * 310 - 620];
async function wall(g, t) {
  const e = t - WALL;
  const out = easeOut(e / B(2));
  // the camera starts on the last window, whole across the frame, and pulls back to the wall
  const [lx, ly] = wallPos(9);
  const zStart = W / 470;
  const z = lerp(zStart, 1, out) * (1 + 0.02 * kick(t, BEAT));
  const rot = lerp(0, -8, out) * (Math.PI / 180);
  const cx = lerp(lx, 0, out);
  const cy = lerp(ly, 0, out);
  const hi = e > B(2) ? Math.floor((e - B(2)) / B(0.5)) % FEATURES.length : -1;
  g.save();
  g.translate(C[0], C[1]);
  g.rotate(rot);
  g.scale(z, z);
  g.translate(-cx, -cy);
  for (let k = 0; k < FEATURES.length; k++) {
    const [x, y] = wallPos(k);
    const on = k === hi;
    const s = (470 / 1280) * (on ? 1.18 : 1);
    const img = await image(featureSrc(FEATURES[k], PER + e));
    g.save();
    g.translate(x, y);
    win(g, img, -640 * s, -400 * s, s, { glow: on ? 1 : 0.15, alpha: hi < 0 || on ? 1 : 0.45 });
    g.restore();
  }
  if (hi >= 0) {
    const [x, y] = wallPos(hi);
    g.font = "900 120px 'Inter Variable'";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "#000";
    g.fillStyle = "#fff";
    g.strokeText(FEATURES[hi].word, x, y);
    g.fillText(FEATURES[hi].word, x, y);
  }
  g.restore();
}

/** The scene through an RGB split of dx px, then torn into shifted bands. */
function glitch(t, dx, tear) {
  if (dx < 0.5 && tear <= 0) {
    ctx.drawImage(scene, 0, 0);
    return;
  }
  for (const ch of channels) {
    const g = ch.c.getContext("2d");
    g.globalCompositeOperation = "source-over";
    g.drawImage(scene, 0, 0);
    g.globalCompositeOperation = "multiply";
    g.fillStyle = ch.colour;
    g.fillRect(0, 0, W, H);
  }
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(channels[0].c, -dx, 0);
  ctx.drawImage(channels[1].c, 0, dx * 0.3);
  ctx.drawImage(channels[2].c, dx, 0);
  ctx.globalCompositeOperation = "source-over";
  for (let k = 0; k < 7 && tear > 0; k++) {
    const y = frameRand(t, k) * H;
    const h = 20 + frameRand(t, k + 20) * 90;
    const shift = (frameRand(t, k + 40) - 0.5) * 160 * tear;
    ctx.drawImage(scene, 0, y, W, h, shift, y, W, h);
  }
}

function end(t) {
  const e = t - ENDS;
  $("end").style.display = e >= 0 ? "block" : "none";
  if (e < 0) return;
  const jit = Math.exp(-e / 0.15);
  [...document.querySelectorAll(".end__body > *")].forEach((el, i) => {
    const k = (e - i * B(0.5)) / 0.12;
    const j = Math.exp(-Math.max(0, e - i * B(0.5)) / 0.12);
    el.style.opacity = String(k > 0 ? (j > 0.3 && frameRand(t, i) > 0.6 ? 0.3 : 1) : 0);
    el.style.transform = `translateX(${((frameRand(t, i + 5) - 0.5) * 60 * j).toFixed(1)}px)`;
    el.style.filter = j > 0.05 ? `drop-shadow(${(-10 * j).toFixed(1)}px 0 0 #ff3b6b) drop-shadow(${(10 * j).toFixed(1)}px 0 0 #3bd5ff)` : "none";
  });
  $("end").style.transform = `translateX(${((frameRand(t, 1) - 0.5) * 40 * jit).toFixed(1)}px)`;
}

async function seek(t) {
  backdrop(sx, t);
  if (t < TUNNEL) await intro(sx, t);
  else if (t < WALL) await tunnel(sx, t);
  else if (t < ENDS) await wall(sx, t);
  // glitches: a hard one on each new window and on the wall, a light one on every beat
  let g = 0.25 * kick(t, BEAT, 0.12);
  if (t >= TUNNEL && t < WALL) g = Math.max(g, Math.exp(-((t - TUNNEL) % PER) / 0.07));
  if (t >= WALL && t < ENDS) g = Math.max(g, Math.exp(-(t - WALL) / 0.1), e2(t));
  if (t < TUNNEL) g = Math.max(g, 0.8 * Math.exp(-(t % BEAT) / 0.08));
  if (t >= ENDS - 0.25 && t < ENDS) g = 1;
  glitch(t, 30 * g, g > 0.4 ? g : 0);
  if (t >= ENDS) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
  }
  end(t);
  $("fade").style.opacity = String(smooth((t - (DURATION - 1.2)) / 1.2));
}
/** On the wall, a light hit each half beat as the next window lights. */
const e2 = (t) => (t - WALL > B(2) ? 0.45 * Math.exp(-((t - WALL - B(2)) % B(0.5)) / 0.05) : 0);

await document.fonts.load("900 100px 'Inter Variable'");
await document.fonts.load("700 100px 'Pixelify Sans'");
await document.fonts.ready;
window.__film = { seek, duration: DURATION, fps: FPS, poster: TUNNEL + 2 * PER + B(2.5) };
document.documentElement.dataset.ready = "1";
