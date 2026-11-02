// The 30 s graphic story: one track goes from four gaps to fixed on the drop, then four beats of what else
// CuePoint does, then the end card. Everything is drawn here, frame by frame through seek(t), on Water's bar grid.
export const FPS = 30;
export const BAR = (60 / 130) * 4;
const BEAT = BAR / 4;
const bar = (n) => 0.2 + n * BAR;
export const DURATION = bar(16);

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (x) => { const k = clamp(x, 0, 1); return k * k * k * (k * (k * 6 - 15) + 10); };
const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 3;
const back = (x) => { const k = clamp(x, 0, 1); const c = 1.7; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };
/** 0..1 over [start, start + dur] */
const k = (t, start, dur = 0.4) => (t - start) / dur;
const pop = (el, t, start, dur = 0.4) => {
  const x = k(t, start, dur);
  el.style.opacity = String(smooth(x));
  el.style.transform = `scale(${0.6 + 0.4 * back(x)})`;
};
const rise = (el, t, start, dur = 0.5, px = 28) => {
  const x = k(t, start, dur);
  el.style.opacity = String(smooth(x));
  el.style.transform = `translateY(${(1 - easeOut(x)) * px}px)`;
};

/* ---------- the scenes, in bars ---------- */
const SCENES = [
  { id: "track", from: 0, to: 4 },
  { id: "wheel", from: 4, to: 6 },
  { id: "set", from: 6, to: 8 },
  { id: "dig", from: 8, to: 10 },
  { id: "export", from: 10, to: 12 },
  { id: "library", from: 12, to: 14 },
  { id: "end", from: 14, to: 16 },
];
const CAPTIONS = [
  [bar(0) + BEAT, "One track. Four gaps."],
  [bar(2), "<b>Matched</b> on Beatport."],
  [bar(3), "Key, BPM, genre, label. Fixed."],
  [bar(4), "Finds the tracks that <b>mix</b> with it."],
  [bar(6), "Plans your set. Every transition <b>checked</b>."],
  [bar(8), "<b>Digs</b> the charts for you."],
  [bar(10), "Straight back to <b>Rekordbox</b>."],
  [bar(12), "Your whole library, <b>ready</b> for the booth."],
];
const XFADE = 0.35;

/* ---------- build the parts that are lists ---------- */
const KEYS = ["1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "9A", "10A", "11A", "12A"];
function buildWheel() {
  const box = $("wheelbox");
  const R = 430, cx = 430, cy = 430;
  const seg = (i, r0, r1, letter) => {
    const a0 = ((i - 3) / 12) * Math.PI * 2, a1 = ((i - 2) / 12) * Math.PI * 2;
    const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    const hue = (i * 30 + 300) % 360;
    const mid = (a0 + a1) / 2, rm = (r0 + r1) / 2;
    return `<path class="seg" data-key="${i + 1}${letter}" d="M${p(r0, a0)} A${r0},${r0} 0 0 1 ${p(r0, a1)} L${p(r1, a1)} A${r1},${r1} 0 0 0 ${p(r1, a0)} Z" fill="hsl(${hue} 35% ${letter === "A" ? 40 : 52}%)"/>
      <text class="seg__t" x="${(cx + rm * Math.cos(mid)).toFixed(1)}" y="${(cy + rm * Math.sin(mid)).toFixed(1)}">${i + 1}${letter}</text>`;
  };
  let svg = `<svg viewBox="0 0 860 860">`;
  for (let i = 0; i < 12; i++) svg += seg(i, R * 0.62, R * 0.82, "A") + seg(i, R * 0.82, R, "B");
  svg += `<circle cx="${cx}" cy="${cy}" r="${R * 0.6}" fill="#141417" stroke="#000" stroke-width="4"/><text class="seg__t" x="${cx}" y="${cy - 10}" style="font-size:40px;fill:#fafafa">9A</text><text class="seg__t" x="${cx}" y="${cy + 36}" style="font-size:24px;fill:#aaaab2">E minor</text></svg>`;
  box.innerHTML = svg;
  // the tracks that mix, tagged beside their keys
  const tags = [["8A", "Low Lagoon", 40, 560], ["10A", "Paper Mirror", 600, 120], ["9B", "Hidden Halo", 640, 640]];
  for (const [key, name, x, y] of tags) {
    const el = document.createElement("div");
    el.className = "wtag";
    el.dataset.key = key;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.textContent = `${name} · ${key}`;
    box.append(el);
  }
}
const SET = [["Static Orbit", "Tamsin Vale", "8A", 120], ["Marble Daylight", "Madsen & Ro", "9A", 129], ["Low Lagoon", "Ayla Voss", "9A", 125], ["Paper Mirror", "Faux Aurora", "10A", 127], ["Blue Shelter", "Nadir Okafor", "10A", 122]];
const LINKS = ["+1 key · same tempo", "same key · +9 BPM", "+1 key · -2 BPM", "same key · -5 BPM"];
function buildSet() {
  const list = $("setlist");
  list.innerHTML = SET.map(([t, a, key, b], i) => `<div class="row"><span class="n">${i + 1}</span><span class="t">${t}</span><span class="a">${a}</span><span class="k">${key}</span><span class="b">${b}</span></div>`).join("");
  LINKS.forEach((text, i) => {
    const el = document.createElement("div");
    el.className = "link";
    el.style.top = `${118 * (i + 1) - 11}px`;
    el.style.width = "auto";
    el.textContent = text;
    list.append(el);
  });
}
const CHARTS = [["Madsen & Ro", "Artist chart · 10 tracks", "2 new"], ["Paper Moon Trax", "Label chart · 10 tracks", "1 new"], ["Ayla Voss", "Artist chart · 10 tracks", "2 new"], ["Faux Aurora", "Artist chart · 10 tracks", "1 new"]];
function buildDeck() {
  $("deck").innerHTML = CHARTS.map(([n, s, c]) => `<div class="ccard"><div class="eyebrow">Beatport</div><div class="name">${n}</div><div class="sub">${s}</div><div class="new">${c}</div></div>`).join("");
}
const LIB = [["Cold Pulse", "Amsel", "4A", 128], ["Northern Season", "Amsel", "6A", 129], ["Violet Harbor", "Amsel", "11A", 136], ["Marble Daylight", "Madsen & Ro", "9A", 129], ["Slow Mirror (Original Mix)", "Anouk Dreyer", "2A", 134], ["Winter Return", "Anouk Dreyer", "12A", 132], ["First Reverie", "Astrid Mallory", "2A", 116], ["Hollow Voltage", "Astrid Mallory", "5A", 117], ["Low Lagoon", "Ayla Voss", "9A", 125], ["Paper Mirror", "Faux Aurora", "10A", 127], ["Hidden Halo", "Elias Marchetti", "9B", 124], ["Blue Shelter", "Nadir Okafor", "10A", 122], ["Static Orbit", "Tamsin Vale", "8A", 120], ["Deep Garden", "Calla Rune", "6B", 125], ["Silver Return", "Calla Rune", "10A", 122], ["Golden Delta", "Calla Rune", "3A", 128]];
function buildTable() {
  $("table").innerHTML = LIB.map(([t, a, key, b]) => `<div class="tr"><span class="t">${t}</span><span class="a">${a}</span><span class="b">${b}</span><span class="k">${key}</span></div>`).join("");
}
buildWheel(); buildSet(); buildDeck(); buildTable();

/* ---------- each scene's motion, in scene-local seconds ---------- */
function track(t) {
  const card = $("card");
  rise(card, t, bar(0), 0.6, 40);
  const bads = [...document.querySelectorAll(".chip.bad")];
  const goods = [...document.querySelectorAll(".chip.good")];
  bads.forEach((el, i) => {
    pop(el, t, bar(0) + (2 + i) * BEAT, 0.3);
    // a flinch on beats 6 and 7: the gaps are not going away by themselves
    for (const b of [6, 7]) {
      const f = k(t, bar(0) + b * BEAT + i * 0.03, 0.3);
      if (f > 0 && f < 1) el.style.transform += ` translateX(${Math.sin(f * Math.PI * 3) * 6 * (1 - f)}px)`;
    }
  });
  [...document.querySelectorAll(".tick")].forEach((el, i) => pop(el, t, bar(3) + i * BEAT * 0.5, 0.3));
  // the wipe on the drop: a green line sweeps the card, above it the track is fixed
  const w = k(t, bar(2), 0.55);
  const wipe = $("wipe");
  const H = card.offsetHeight;
  wipe.style.opacity = w > 0 && w < 1.05 ? "1" : "0";
  wipe.style.top = `${easeOut(w) * H}px`;
  const line = easeOut(w) * H;
  const fixed = (el) => el.getBoundingClientRect().top - card.getBoundingClientRect().top + el.offsetHeight / 2 < line;
  bads.forEach((el) => { if (w > 0 && fixed(el)) el.style.opacity = "0"; });
  goods.forEach((el) => { el.style.transform = "none"; el.style.opacity = w > 0 && fixed(el) ? "1" : "0"; });
  $("cover").querySelector(".cover__art").style.opacity = w > 0 && line > 120 ? "1" : "0";
  $("cover").querySelector(".cover__q").style.opacity = w > 0 && line > 120 ? "0" : "1";
  pop($("matched"), t, bar(2) + 2 * BEAT, 0.35);
}
function wheel(t) {
  const segs = [...document.querySelectorAll(".seg")];
  const texts = [...document.querySelectorAll(".seg__t")];
  const t0 = bar(4);
  segs.forEach((el, i) => {
    const x = k(t, t0 + (i / 24) * BAR * 0.9, 0.25);
    el.style.opacity = String(smooth(x));
    el.style.filter = "none";
  });
  texts.forEach((el, i) => { if (i < 24) el.style.opacity = String(smooth(k(t, t0 + (i / 24) * BAR * 0.9, 0.25))); });
  const light = (key, at) => {
    const el = document.querySelector(`.seg[data-key="${key}"]`);
    if (!el) return;
    const x = smooth(k(t, at, 0.3));
    el.style.filter = `brightness(${1 + 0.9 * x}) saturate(${1 + x})`;
  };
  light("9A", t0 + 4 * BEAT);
  [["8A", 5], ["10A", 6], ["9B", 7]].forEach(([key, b]) => {
    light(key, t0 + b * BEAT);
    pop(document.querySelector(`.wtag[data-key="${key}"]`), t, t0 + b * BEAT, 0.3);
  });
}
function set(t) {
  const t0 = bar(6);
  [...document.querySelectorAll(".row")].forEach((el, i) => {
    const x = k(t, t0 + i * BEAT * 0.5, 0.4);
    el.style.opacity = String(smooth(x));
    el.style.transform = `translateX(${(1 - easeOut(x)) * -60}px)`;
  });
  [...document.querySelectorAll(".link")].forEach((el, i) => {
    const x = k(t, t0 + 3 * BEAT + i * BEAT, 0.3);
    el.style.opacity = String(smooth(x));
    el.style.background = x > 0.5 ? "var(--good)" : "#3a3a42";
    el.style.color = x > 0.5 ? "var(--outline)" : "var(--fg)";
  });
}
function dig(t) {
  const t0 = bar(8);
  const spots = [[-245, -60, -3], [245, -40, 3], [-245, 230, 2], [245, 250, -3]];
  [...document.querySelectorAll(".ccard")].forEach((el, i) => {
    const x = k(t, t0 + i * BEAT * 0.5, 0.45);
    const [dx, dy, rot] = spots[i];
    el.style.opacity = String(smooth(x));
    const bob = Math.sin((t - t0) * 2.2 + i) * 6;
    el.style.transform = `translate(${easeOut(x) * dx}px, ${easeOut(x) * dy + (1 - easeOut(x)) * 120 + bob}px) rotate(${easeOut(x) * rot + Math.sin((t - t0) * 1.7 + i) * 0.8}deg) scale(${0.9 + 0.1 * easeOut(x)})`;
  });
  pop($("found"), t, t0 + 5 * BEAT, 0.35);
}
function exportScene(t) {
  const t0 = bar(10);
  const file = $("file");
  const x = k(t, t0 + BEAT, 1.0);
  file.style.opacity = "1";
  file.style.transform = `translateX(${smooth(x) * 330}px) scale(${1 - 0.2 * smooth(x)})`;
  file.style.opacity = String(1 - smooth((x - 0.85) / 0.15));
  $("slot").style.borderColor = x >= 1 ? "var(--good)" : "#52525b";
  pop($("slot").querySelector(".slot__tick"), t, t0 + BEAT + 1.0, 0.3);
  [...document.querySelectorAll(".stamp")].forEach((el, i) => pop(el, t, t0 + 4.5 * BEAT + i * BEAT * 0.5, 0.3));
}
function library(t) {
  const t0 = bar(12);
  const x = smooth(k(t, t0, BAR * 1.6));
  $("counter").textContent = `${Math.round(300 * x)} tracks ready`;
  const table = $("table");
  rise(table, t, t0, 0.5, 40);
  const roll = Math.max(0, t - t0 - 1.2) * 40;
  [...table.querySelectorAll(".tr")].forEach((el, i) => {
    el.style.opacity = String(smooth(k(t, t0 + 0.2 + i * 0.1, 0.25)));
    el.style.transform = `translateY(${-roll}px)`;
  });
}
function endCard(t) {
  const t0 = bar(14);
  [...document.querySelectorAll(".end__body > *")].forEach((el, i) => rise(el, t, t0 + i * BEAT * 0.5, 0.5));
}
const MOTION = { track, wheel, set, dig, export: exportScene, library, end: endCard };

/* ---------- captions: the old one leaves as the new one glides in ---------- */
function captions(t) {
  const a = $("capA"), b = $("capB");
  let cur = -1;
  CAPTIONS.forEach(([at], i) => { if (t >= at) cur = i; });
  for (const [el, i] of [[a, cur], [b, cur - 1]]) {
    if (i < 0 || (el === a && t >= bar(14))) { el.style.opacity = "0"; continue; }
    el.innerHTML = CAPTIONS[i][1];
    if (el === a) rise(el, t, CAPTIONS[i][0], 0.45, 24);
    else { el.style.transform = "none"; el.style.opacity = String(1 - smooth((t - CAPTIONS[cur][0]) / 0.3)); }
  }
  if (cur >= 0 && t >= bar(14)) { a.style.opacity = "0"; b.style.opacity = "0"; }
}

export function seek(t) {
  const chromeOn = t >= bar(0) && t < bar(14);
  $("brand").style.opacity = String(chromeOn ? smooth(k(t, 0, 0.4)) : 0);
  $("url").style.opacity = $("brand").style.opacity;
  for (const s of SCENES) {
    const el = $(s.id);
    const from = bar(s.from), to = bar(s.to);
    const on = t >= from - XFADE && t < to + XFADE;
    el.style.display = on ? "block" : "none";
    if (!on) continue;
    const inK = smooth((t - from) / XFADE), outK = s.id === "end" ? 1 : 1 - smooth((t - to) / XFADE);
    el.style.opacity = String(Math.min(inK, outK));
    el.style.transform = s.id === "end" ? "none" : `scale(${1 + 0.03 * (1 - inK)})`;
    MOTION[s.id](t);
  }
  captions(t);
  $("fade").style.opacity = String(Math.max(1 - smooth(t / 0.5), smooth((t - (DURATION - 0.9)) / 0.9)));
}

await document.fonts.ready;
window.__story = { seek, duration: DURATION, fps: FPS, bar };
document.documentElement.dataset.ready = "1";
