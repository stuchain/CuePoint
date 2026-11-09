// Fast film 1, slam (sub_clair's "Technology", 125 BPM, from 72.53 s so the drop lands at 5.76 s): four problem words
// slam over the old library, the icon builds from blocks, then on the drop all ten features, four beats each: the
// window floats in 3D while its word slams, punches in to the moment on beat 2, and leaves by a whip, a slash, a flip
// or a zoom. Eight half-beat cuts, then the end card with key chips bursting. seek(t) draws t seconds.
import { $, FPS, clamp, easeOut, lerp, place, smooth } from "./lib.js";
import { FEATURES, KEY_CHIPS, featureSrc, kick, setSrc } from "./fast.js";

const BEAT = 60 / 125;
const DROP = 12 * BEAT;
const PER = 4 * BEAT;
const FINALE = DROP + FEATURES.length * PER;
const ENDS = FINALE + 4 * BEAT;
const DURATION = ENDS + 8 * BEAT;
const W = 1080;
const H = 1350;
/** How each feature leaves for the next. */
const TRANS = ["whip", "slash", "flip", "zoom"];
/** Half the time a transition takes, either side of the cut. */
const HALF = 0.12;
const PROBLEMS = ["Keys missing.", "Not matched.", "Tags a mess.", "No set plan."];
const FINALE_CUTS = [2, 5, 4, 3, 9, 7, 8, 0];

const easeIn = (x) => clamp(x, 0, 1) ** 3;
const slots = [0, 1].map((n) => {
  const el = $(`slot${n}`);
  return { el, n, card: el.querySelector(".card"), img: el.querySelector(".card img"), word: el.querySelector(".word"), band: el.querySelector(".band"), bandWord: el.querySelector(".band__word"), bandLine: el.querySelector(".band__line"), blur: $(`whipBlur${n}`) };
});

// floating chips behind the windows, and the ones that burst from the end card
const rand = (() => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();
const floaters = KEY_CHIPS.map(([code, colour], i) => {
  const el = document.createElement("div");
  el.textContent = code;
  el.style.background = colour;
  $("chips").append(el);
  return { el, x: rand() * 980, y: rand() * 1350, speed: 40 + rand() * 60, spin: (rand() - 0.5) * 40, depth: 0.55 + rand() * 0.6, i };
});
const bursts = KEY_CHIPS.map(([code, colour], i) => {
  const el = document.createElement("div");
  el.textContent = code;
  el.style.background = colour;
  $("burst").append(el);
  const a = (i / KEY_CHIPS.length) * Math.PI * 2 + 0.2;
  return { el, a, dist: 430 + rand() * 260, spin: (rand() - 0.5) * 160 };
});
// the icon in 4 x 4 blocks that fly together
const blocks = [];
for (let r = 0; r < 4; r++)
  for (let c = 0; c < 4; c++) {
    const el = document.createElement("div");
    el.style.left = `${c * 80}px`;
    el.style.top = `${r * 80}px`;
    el.style.backgroundPosition = `${-c * 80}px ${-r * 80}px`;
    $("blocks").append(el);
    blocks.push({ el, dx: (rand() - 0.5) * 1400, dy: (rand() - 0.5) * 1600, rot: (rand() - 0.5) * 540, delay: rand() * 0.5 * BEAT });
  }

function background(t) {
  const k = t >= DROP ? kick(t, BEAT) : 0.3 * kick(t, 2 * BEAT);
  const speed = t < DROP ? 60 : 360;
  const run = t < DROP ? t * speed : DROP * 60 + (t - DROP) * speed;
  $("floor").style.backgroundPosition = `0 ${run.toFixed(1)}px`;
  $("floor").style.opacity = String(0.55 + 0.45 * k);
  $("bg").style.filter = `brightness(${(1 + 0.35 * k).toFixed(3)})`;
  for (const f of floaters) {
    const y = ((((f.y - t * f.speed * (t > DROP ? 2.2 : 1)) % 1500) + 1500) % 1500) - 120;
    f.el.style.transform = `translate(${f.x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(f.spin * t).toFixed(1)}deg) scale(${(f.depth * (1 + 0.12 * k)).toFixed(3)})`;
    f.el.style.opacity = String(0.35 + 0.25 * f.depth);
  }
}

function intro(t) {
  $("intro").style.display = t < DROP + HALF ? "block" : "none";
  if (t >= DROP + HALF) return;
  const b = Math.floor(t / BEAT);
  // a new crop of the old library every two beats, jerking in
  const word = Math.floor(b / 2);
  const pic = $("introPic");
  const crops = [[1000, 300, 2.6], [760, 420, 2.2], [1100, 520, 2.8], [600, 260, 2.4]];
  const [cx, cy, z] = crops[Math.min(word, 3)];
  const u = t - word * 2 * BEAT;
  place(pic, W, H, cx, cy, z * (1 + 0.05 * u));
  pic.parentElement.style.opacity = String(word < 4 ? 0.9 : Math.max(0, 0.9 - (t - 8 * BEAT) / BEAT));
  const w = $("introWord");
  if (word < 4) {
    w.textContent = PROBLEMS[word];
    const s = 1 + 1.4 * (1 - easeOut(u / 0.14));
    const shake = Math.sin(u * 80) * 14 * Math.exp(-u / 0.12);
    w.style.transform = `translateX(${shake.toFixed(1)}px) scale(${s.toFixed(3)})`;
    w.style.opacity = String(smooth(u / 0.05));
  } else w.style.opacity = "0";
  // the icon builds over beats 8 to 10, the name slams on beat 10
  const build = t - 8 * BEAT;
  for (const bl of blocks) {
    const k = easeOut((build - bl.delay) / (1.5 * BEAT));
    bl.el.style.opacity = String(build > bl.delay ? 1 : 0);
    bl.el.style.transform = `translate(${(bl.dx * (1 - k)).toFixed(1)}px, ${(bl.dy * (1 - k)).toFixed(1)}px) rotate(${(bl.rot * (1 - k)).toFixed(1)}deg)`;
  }
  const settle = t - 10 * BEAT;
  $("blocks").style.transform = `translateY(${settle > 0 ? -80 * easeOut(settle / 0.2) : 0}px) scale(${settle > 0 ? 1 + 0.08 * kick(settle, BEAT) : 1})`;
  const name = $("introName");
  name.style.opacity = String(settle > 0 ? 1 : 0);
  name.style.transform = `scale(${(1 + 1.2 * (1 - easeOut(settle / 0.14))).toFixed(3)})`;
}

/** Draw feature i into a slot, u seconds into its four beats. */
async function feature(slot, i, u) {
  const f = FEATURES[i];
  slot.el.style.display = "block";
  await setSrc(slot.img, featureSrc(f, u));
  const side = i % 2 ? -1 : 1;
  const k = easeOut((u - 2 * BEAT) / 0.22);
  const push = Math.max(0, u - 2 * BEAT) / (2 * BEAT);
  const pulse = 1 + 0.03 * kick(u, BEAT) * (1 - k);
  const w = lerp(960, W, k);
  const h = lerp(600, H, k);
  const cy = lerp(800, H / 2, k);
  const ry = side * (20 - 12 * easeOut(u / 0.5)) * (1 - k);
  const rx = 7 * (1 - k);
  const shake = Math.sin(u * 90) * 16 * Math.exp(-u / 0.1) * (1 - k);
  Object.assign(slot.card.style, {
    width: `${w}px`, height: `${h}px`,
    transform: `translate(${(W / 2 - w / 2 + shake).toFixed(1)}px, ${(cy - h / 2).toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) scale(${pulse.toFixed(4)})`,
    boxShadow: `${(18 * (1 - k)).toFixed(1)}px ${(18 * (1 - k)).toFixed(1)}px 0 #000, 0 0 ${(80 * (1 - k)).toFixed(0)}px rgba(145,100,246,${(0.7 * (1 - k)).toFixed(2)})`,
    borderWidth: `${(5 * (1 - k)).toFixed(1)}px`,
  });
  const [fx, fy] = f.focus;
  place(slot.img, w - 10 * (1 - k), h - 10 * (1 - k), lerp(640, fx, k), lerp(400, fy, k), lerp(1, f.z, k) * (1 + 0.08 * push));
  // the word slams on the beat, then gives way to the band once the window punches in
  slot.word.textContent = f.word;
  const s = 1 + 1.6 * (1 - easeOut(u / 0.15));
  slot.word.style.opacity = String(smooth(u / 0.05) * (1 - k));
  slot.word.style.transform = `scale(${s.toFixed(3)})`;
  slot.bandWord.textContent = f.word;
  slot.bandLine.textContent = f.line;
  const slide = easeOut((u - 2 * BEAT - 0.06) / 0.24);
  slot.band.style.transform = `translateX(${(-1000 * (1 - slide)).toFixed(1)}px)`;
  slot.band.style.opacity = String(u > 2 * BEAT ? 1 : 0);
}

function clear(slot) {
  Object.assign(slot.el.style, { display: "none", transform: "", opacity: "1", clipPath: "", filter: "", zIndex: "" });
  slot.blur.setAttribute("stdDeviation", "0 0");
}

/** The way out of feature i into i + 1, e from 0 to 1 across the cut. */
function transition(type, out, into, e) {
  const S = (s, o) => Object.assign(s.el.style, o);
  if (type === "whip") {
    const blur = (90 * Math.sin(Math.PI * clamp(e, 0, 1))).toFixed(1);
    S(out, { transform: `translateX(${(-1400 * easeIn(e)).toFixed(1)}px)`, filter: "url(#whip0)", zIndex: 2 });
    S(into, { transform: `translateX(${(1400 * (1 - easeOut(e))).toFixed(1)}px)`, filter: "url(#whip1)", zIndex: 3 });
    out.blur.setAttribute("stdDeviation", `${blur} 0`);
    into.blur.setAttribute("stdDeviation", `${blur} 0`);
  } else if (type === "slash") {
    const p = lerp(W + 0.5 * H + 120, -140, easeOut(e));
    S(into, { clipPath: `polygon(${p}px 0, 2400px 0, 2400px ${H}px, ${p - 0.5 * H}px ${H}px)`, zIndex: 3 });
    S(out, { zIndex: 2 });
    Object.assign($("slash").style, { display: e > 0 && e < 1 ? "block" : "none", zIndex: 4, clipPath: `polygon(${p - 70}px 0, ${p}px 0, ${p - 0.5 * H}px ${H}px, ${p - 0.5 * H - 70}px ${H}px)` });
  } else if (type === "flip") {
    if (e < 0.5) {
      S(out, { transform: `rotateY(${(90 * easeIn(e * 2)).toFixed(2)}deg)`, zIndex: 3 });
      S(into, { display: "none" });
    } else {
      S(into, { transform: `rotateY(${(-90 * (1 - easeOut((e - 0.5) * 2))).toFixed(2)}deg)`, zIndex: 3 });
      S(out, { display: "none" });
    }
  } else {
    S(out, { transform: `scale(${(1 + 2.4 * easeIn(e)).toFixed(3)})`, opacity: String(1 - smooth(e)), zIndex: 3 });
    S(into, { transform: `scale(${(0.55 + 0.45 * easeOut(e)).toFixed(3)})`, zIndex: 2 });
  }
}

async function features(t) {
  for (const s of slots) clear(s);
  $("slash").style.display = "none";
  if (t < DROP - HALF || t >= FINALE + HALF) return;
  const i = clamp(Math.floor((t - DROP) / PER), 0, FEATURES.length - 1);
  const u = t - DROP - i * PER;
  const cur = slots[i % 2];
  await feature(cur, i, u);
  // into the first feature from the intro: a flash and a zoom in
  if (i === 0 && u < HALF) cur.el.style.transform = `scale(${(0.4 + 0.6 * easeOut((u + HALF) / (2 * HALF))).toFixed(3)})`;
  // into the next feature
  if (u > PER - HALF && i + 1 < FEATURES.length) {
    const nxt = slots[(i + 1) % 2];
    await feature(nxt, i + 1, 0);
    transition(TRANS[i % 4], cur, nxt, (u - (PER - HALF)) / (2 * HALF));
  }
  // out of the previous feature
  if (u < HALF && i > 0) {
    const prev = slots[(i - 1) % 2];
    await feature(prev, i - 1, PER - 0.001);
    transition(TRANS[(i - 1) % 4], prev, cur, (u + HALF) / (2 * HALF));
  }
}

async function finale(t) {
  const on = t >= FINALE && t < ENDS;
  $("finale").style.display = on ? "block" : "none";
  if (!on) return;
  const n = Math.floor((t - FINALE) / (BEAT / 2));
  const u = t - FINALE - n * (BEAT / 2);
  const f = FEATURES[FINALE_CUTS[n]];
  const pic = $("finalePic");
  await setSrc(pic, featureSrc(f, 2 * BEAT + u));
  place(pic, W, H, f.focus[0], f.focus[1], f.z * (1.0 + 0.4 * u));
  const word = $("finaleWord");
  word.textContent = f.word;
  word.style.transform = `scale(${(1 + 0.8 * (1 - easeOut(u / 0.1))).toFixed(3)}) rotate(${n % 2 ? -3 : 3}deg)`;
  $("finale").style.filter = n % 3 === 1 ? "hue-rotate(40deg) saturate(1.4)" : n % 3 === 2 ? "saturate(1.6) contrast(1.15)" : "none";
}

function end(t) {
  const e = t - ENDS;
  const end = $("end");
  end.style.display = e >= 0 ? "block" : "none";
  if (e < 0) {
    $("burst").style.display = "none";
    return;
  }
  const kids = [...end.querySelectorAll(".end__body > *")];
  kids.forEach((el, i) => {
    const at = i === 0 ? 0 : (i + 1) * (BEAT / 2);
    const k = (e - at) / 0.3;
    el.style.opacity = String(smooth(k * 3));
    el.style.transform = i === 0 ? `scale(${(easeOut(k) * (1 + 0.25 * Math.sin(Math.PI * clamp(k, 0, 1)))).toFixed(3)}) rotate(${(-90 * (1 - easeOut(k))).toFixed(1)}deg)` : `translateY(${((1 - easeOut(k)) * 40).toFixed(1)}px) scale(${(1 + 0.4 * (1 - easeOut(k))).toFixed(3)})`;
  });
  $("burst").style.display = "block";
  for (const b of bursts) {
    const k = easeOut(e / 1.4);
    const x = 540 + Math.cos(b.a) * b.dist * k - 40;
    const y = 470 + Math.sin(b.a) * b.dist * k * 1.2 - 25;
    b.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(b.spin * k).toFixed(1)}deg) scale(${(0.4 + 0.6 * k).toFixed(3)})`;
    b.el.style.opacity = String(Math.min(1, e / 0.1) * (1 - smooth((e - 1.6) / 1.2)) * 0.9);
  }
}

async function seek(t) {
  background(t);
  intro(t);
  await features(t);
  await finale(t);
  end(t);
  // a white hit on the drop, on each new feature and on each finale cut
  let flash = 0;
  const sinceDrop = t - DROP;
  if (sinceDrop >= 0 && t < FINALE) flash = 0.55 * Math.exp(-(sinceDrop % PER) / 0.05);
  if (t >= FINALE && t < ENDS) flash = 0.35 * Math.exp(-((t - FINALE) % (BEAT / 2)) / 0.04);
  if (t >= ENDS) flash = 0.7 * Math.exp(-(t - ENDS) / 0.08);
  if (Math.abs(t - 10 * BEAT) < 0.3 && t >= 10 * BEAT) flash = 0.5 * Math.exp(-(t - 10 * BEAT) / 0.06);
  $("flash").style.opacity = String(flash.toFixed(3));
  $("fade").style.opacity = String(smooth((t - (DURATION - 1.2)) / 1.2));
}

await document.fonts.ready;
await setSrc($("introPic"), "frames/wipe-library-before.png");
window.__film = { seek, duration: DURATION, fps: FPS, poster: DROP + 2 * PER + 2.6 * BEAT };
document.documentElement.dataset.ready = "1";
