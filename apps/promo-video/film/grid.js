// Fast film 2, grid (Musinova's "Minimal Techno Electronic Underscore", 100 BPM, from 45.62 s so the beat returns at
// 4.8 s): "TEN TOOLS. ONE APP." in huge type over the breakdown, then on the return nine features at once in a grid,
// five bars of split screens pushing in on the beats, sixteen half-beat flash cuts, a mosaic of twenty tiles that
// collapses into the end card. Light paper, black ink, the violet of the app. seek(t) draws t seconds.
import { $, FPS, clamp, easeOut, lerp, place, smooth } from "./lib.js";
import { FEATURES, featureSrc, kick, setSrc } from "./fast.js";

const BEAT = 60 / 100;
const DROP = 8 * BEAT;
const B = (n) => n * BEAT;
const W = 1080;
const H = 1350;
const DURATION = B(52);
const byId = Object.fromEntries(FEATURES.map((f, i) => [f.id, i]));
const PAIRS = [["library", "player"], ["clean", "discover"], ["prepare", "keys"], ["statistics", "save"], ["export", "settings"]].map((p) => p.map((id) => byId[id]));
const GRID9 = ["library", "clean", "discover", "keys", "prepare", "player", "statistics", "save", "export"].map((id) => byId[id]);
const CUTS = ["clean", "keys", "discover", "prepare", "save", "library", "export", "statistics", "player", "settings", "clean", "keys", "prepare", "discover", "export", "settings"].map((id) => byId[id]);
const easeIn = (x) => clamp(x, 0, 1) ** 3;
const back = (x) => {
  const k = clamp(x, 0, 1) - 1;
  return 1 + 2.4 * k * k * k + 1.4 * k * k;
};

const tiles = Array.from({ length: 20 }, () => {
  const el = document.createElement("div");
  el.className = "tile";
  const img = document.createElement("img");
  el.append(img);
  $("tiles").append(el);
  return { el, img };
});
const labels = Array.from({ length: 2 }, () => {
  const el = document.createElement("div");
  el.className = "label";
  el.innerHTML = '<div class="label__word"></div><div class="label__line"></div>';
  $("labels").append(el);
  return { el, word: el.querySelector(".label__word"), line: el.querySelector(".label__line"), text: "" };
});
const rand = (() => {
  let s = 11;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();
const MOSAIC = Array.from({ length: 20 }, (_, i) => ({ dx: (rand() - 0.5) * 2200, dy: (rand() - 0.5) * 2600, rot: (rand() - 0.5) * 120, delay: rand() * B(1.4) }));

let used = 0;
/** Put feature i, u seconds in, into the next free tile: box x, y, w, h; z the zoom on its moment (1 = whole window across). */
async function tile(i, u, { x, y, w, h, z, rot = 0, scale = 1, opacity = 1, shadow = 12, focus }) {
  const t = tiles[used++];
  const f = FEATURES[i];
  await setSrc(t.img, featureSrc(f, u));
  Object.assign(t.el.style, { display: "block", width: `${w}px`, height: `${h}px`, opacity: String(opacity), transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`, boxShadow: `${shadow}px ${shadow}px 0 var(--ink)` });
  const [fx, fy] = focus ?? f.focus;
  place(t.img, w - 12, h - 12, fx, fy, z);
}

/** A label: the word's letters drop in one after another from `at`, the line slides in after them. */
function label(n, i, at, t, { x, y, ink = false, size = 170, quick = false }) {
  const l = labels[n];
  const f = FEATURES[i];
  if (l.text !== f.word) {
    l.word.innerHTML = [...f.word].map((c) => `<span>${c}</span>`).join("");
    l.line.textContent = f.line;
    l.text = f.word;
  }
  l.el.className = ink ? "label label--ink" : "label";
  l.word.style.fontSize = `${size}px`;
  Object.assign(l.el.style, { display: "block", transform: `translate(${x}px, ${y}px)` });
  [...l.word.children].forEach((s, k) => {
    const e = quick ? (t - at - k * 0.008) / 0.08 : (t - at - k * 0.03) / 0.18;
    s.style.transform = `translateY(${(-120 * (1 - easeOut(e))).toFixed(1)}px) rotate(${(-25 * (1 - easeOut(e))).toFixed(1)}deg)`;
    s.style.opacity = String(e > 0 ? 1 : 0);
  });
  const e = (t - at - 0.25) / 0.25;
  l.line.style.transform = `translateX(${(-700 * (1 - easeOut(e))).toFixed(1)}px)`;
  l.line.style.opacity = String(e > 0 ? 1 : 0);
}

let fitted = false;
function fitKin() {
  if (fitted) return;
  for (const el of document.querySelectorAll(".kin__line")) {
    el.style.fontSize = "300px";
    const size = Math.min(400, (300 * 1010) / el.scrollWidth);
    el.style.fontSize = `${size.toFixed(1)}px`;
  }
  $("kin").style.top = `${((H - $("kin").offsetHeight) / 2 - 40).toFixed(0)}px`;
  fitted = true;
}

function intro(t) {
  const kin = $("kin");
  kin.style.display = t < DROP ? "block" : "none";
  if (t >= DROP) return;
  [...kin.children].forEach((el, i) => {
    const e = (t - B(i)) / 0.3;
    const dir = i % 2 ? 1 : -1;
    // each line drives in on its beat, then the lines drift apart in alternate directions
    const drift = Math.max(0, t - B(4)) * 90 * dir;
    el.style.transform = `translateX(${(dir * 1300 * (1 - easeOut(e)) + drift).toFixed(1)}px) skewX(${(dir * -18 * (1 - easeOut(e))).toFixed(1)}deg)`;
    el.style.opacity = String(e > 0 ? 1 : 0);
  });
  // a violet panel rises over beats 6 to 8
  $("panel").style.height = `${(H * easeIn((t - B(6)) / B(2))).toFixed(1)}px`;
}

async function grid(t) {
  // nine features pop in from the centre outwards on the return, then fly off on beat 12
  const e0 = t - DROP;
  const gap = 24;
  const tw = (W - 4 * gap) / 3;
  const th = (H - 4 * gap) / 3;
  const out = easeIn((t - B(12) + 0.1) / 0.3);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const k = r * 3 + c;
      const d = Math.abs(r - 1) + Math.abs(c - 1);
      const e = (e0 - d * 0.07) / 0.3;
      if (e <= 0) continue;
      const pulse = 1 + 0.04 * kick(e0, BEAT, 0.25);
      const x = gap + c * (tw + gap);
      const y = gap + r * (th + gap);
      await tile(GRID9[k], e0, { x: x + (c - 1) * 900 * out, y: y + (r - 1) * 1100 * out, w: tw, h: th, z: FEATURES[GRID9[k]].z * 1.25, scale: back(e) * pulse, rot: (1 - easeOut(e)) * (c - 1) * 20, shadow: 10 });
    }
  const chip = $("chipline");
  const ce = (t - B(10)) / 0.25;
  chip.style.display = ce > 0 && t < B(12) ? "block" : "none";
  chip.style.transform = `translate(-50%, -50%) rotate(-6deg) scale(${(back(ce) * (1 + 0.05 * kick(t - B(10), BEAT))).toFixed(3)})`;
}

async function pairs(t) {
  const half = H / 2;
  const n = Math.floor((t - B(12)) / B(4));
  const u = t - B(12) - n * B(4);
  // the top half pushes in on the bar, the bottom one a beat later; each pushes out the one before
  const halves = [
    { at: 0, y: 0, dir: -1 },
    { at: B(1), y: half, dir: 1 },
  ];
  for (let s = 0; s < 2; s++) {
    const { y, dir } = halves[s];
    // the first pair comes in together, so the grid leaving never shows empty paper
    const at = n === 0 ? 0 : halves[s].at;
    const e = easeOut((u - at) / 0.28);
    const push = u >= at ? e : 0;
    const cur = PAIRS[n][s];
    const prev = n > 0 ? PAIRS[n - 1][s] : null;
    const w = W;
    const h = half - 6;
    const z = FEATURES[cur].z * 0.95;
    if (prev !== null && push < 1) await tile(prev, B(4) + u, { x: -dir * W * push, y: y + 3, w, h, z: FEATURES[prev].z * 0.95, shadow: 0 });
    if (push > 0) await tile(cur, Math.max(0, u - at), { x: dir * W * (1 - push), y: y + 3, w, h, z: z * (1 + 0.05 * (u - at)), shadow: 0 });
    const show = push > 0 ? cur : prev;
    if (show !== null) label(s, show, push > 0 ? n * B(4) + B(12) + at + 0.05 : (n - 1) * B(4) + B(12) + at + 0.05, t, { x: 34, y: y + half - 290 });
  }
}

async function cuts(t) {
  const n = Math.floor((t - B(32)) / B(0.5));
  const u = t - B(32) - n * B(0.5);
  const i = CUTS[n];
  const f = FEATURES[i];
  if (n % 2 === 0) {
    await tile(i, B(2) + u * 2, { x: -6, y: -6, w: W + 12, h: H + 12, z: f.z * 1.15 * (1 + 0.25 * u), shadow: 0 });
    label(0, i, t - u - 0.02, t, { x: 40, y: 900, size: 210, quick: true });
  } else {
    $("stripe").style.display = "block";
    $("stripe").style.transform = `rotate(${n % 4 === 1 ? -14 : 14}deg) translateX(${(-200 + 400 * u).toFixed(1)}px)`;
    await tile(i, B(2) + u * 2, { x: 90, y: 400, w: 900, h: 562, z: 1.05, rot: n % 4 === 1 ? -4 : 4, scale: back(u / 0.12), focus: [640, 400] });
    label(0, i, t - u - 0.02, t, { x: 70, y: 120, ink: true, size: 210, quick: true });
  }
}

async function mosaic(t) {
  const e0 = t - B(40);
  const s = 270;
  const collapse = easeIn((t - B(43)) / B(1));
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 4; c++) {
      const k = r * 4 + c;
      const m = MOSAIC[k];
      const e = easeOut((e0 - m.delay) / 0.35);
      if (e0 < m.delay) continue;
      const x = c * s;
      const y = r * s;
      // collapse: every tile slides to the centre and shrinks
      const cx = lerp(x, W / 2 - s / 2, collapse);
      const cy = lerp(y, H / 2 - s / 2, collapse);
      await tile((k * 3) % 10, e0, { x: cx + m.dx * (1 - e), y: cy + m.dy * (1 - e), w: s, h: s, z: FEATURES[(k * 3) % 10].z * 1.5, rot: m.rot * (1 - e) + collapse * 90, scale: 1 - 0.9 * collapse, shadow: 8 });
    }
}

function end(t) {
  const e = t - B(44);
  $("end").style.display = e >= 0 ? "block" : "none";
  if (e < 0) return;
  [...document.querySelectorAll(".end__body > *")].forEach((el, i) => {
    const k = (e - i * B(0.5)) / 0.3;
    el.style.opacity = String(k > 0 ? 1 : 0);
    el.style.transform = i === 0 ? `scale(${back(k).toFixed(3)}) rotate(${(180 * (1 - easeOut(k))).toFixed(1)}deg)` : `translateY(${(80 * (1 - easeOut(k))).toFixed(1)}px) scale(${(0.6 + 0.4 * back(k)).toFixed(3)})`;
  });
}

async function seek(t) {
  fitKin();
  used = 0;
  for (const l of labels) l.el.style.display = "none";
  $("stripe").style.display = "none";
  // the paper's grid slides with the beat once the music is back
  const run = t < DROP ? t * 20 : DROP * 20 + (t - DROP) * 120 + 30 * kick(t, BEAT);
  $("paper").style.backgroundPosition = `${run.toFixed(1)}px ${(run * 0.5).toFixed(1)}px`;
  intro(t);
  $("panel").style.display = t < DROP ? "block" : "none";
  $("paper").style.background = t >= DROP && t < B(12) ? "var(--accent)" : "";
  if (t >= DROP && t < B(12) + 0.3) await grid(t);
  if (t >= B(12) && t < B(32)) await pairs(t);
  if (t >= B(32) && t < B(40)) await cuts(t);
  if (t >= B(40) && t < B(44)) await mosaic(t);
  end(t);
  for (let k = used; k < tiles.length; k++) tiles[k].el.style.display = "none";
  // a violet hit on the return, on each bar of split screens and on the end card
  let flash = 0;
  if (t >= DROP && t < B(32)) flash = 0.45 * Math.exp(-((t - DROP) % B(4)) / 0.06);
  if (t >= B(44)) flash = 0.8 * Math.exp(-(t - B(44)) / 0.1);
  $("flash").style.opacity = String(flash.toFixed(3));
  $("fade").style.opacity = String(smooth((t - (DURATION - 1.2)) / 1.2));
}

await document.fonts.ready;
window.__film = { seek, duration: DURATION, fps: FPS, poster: B(9.4) };
document.documentElement.dataset.ready = "1";
