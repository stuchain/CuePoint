// The five showcase films (pro-launch, pro-case, pro-builder, pro-evening, pro-why): one calm look and a handful of
// scene kinds, each film a list of scenes measured in beats (pro-films.js). Scenes dissolve into each other; the
// camera only glides. seek(t) draws t seconds.
import { $, FPS, clamp, easeOut, lerp, place, smooth } from "./lib.js";
import { CLIPS, FEATURES, featureSrc, frameSrc, setSrc } from "./fast.js";
import { FILMS } from "./pro-films.js";

const W = 1080;
const H = 1350;
const FADE = 0.5;
const byId = Object.fromEntries(FEATURES.map((f) => [f.id, f]));
const ICON = "../demo/assets/icon.png";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const film = FILMS[document.documentElement.dataset.film];
const BEAT = 60 / film.bpm;
let at = 0;
const scenes = film.scenes.map((s) => {
  const scene = { ...s, start: at, dur: s.beats * BEAT };
  at += scene.dur;
  return scene;
});
const DURATION = at;

/** A window box that can glide from its framed place to full bleed. */
const boxHtml = (extra = "") => `<div class="box"><img class="pic" alt="" />${extra}</div>`;
const markHtml = `<div class="mark"><img src="${ICON}" alt="" /><span>CuePoint</span></div>`;
const dotsHtml = (d) => (d ? `<div class="dots">${Array.from({ length: d[1] }, (_, i) => `<i class="${i < d[0] ? "on" : ""}"></i>`).join("")}</div>` : "");

/** A line as word spans, so the words can ease in one after another. */
const words = (text) => text.split(" ").map((w) => `<span class="w">${esc(w)}</span>`).join(" ");

function build(s) {
  const el = document.createElement("div");
  el.className = `scene ${s.type}`;
  if (s.type === "title") {
    el.innerHTML = `${boxHtml()}<div class="shade" style="background:linear-gradient(#0e0e12 34%, rgba(14,14,18,.25) 62%, #0e0e12 100%)"></div>
      <div class="top"><img src="${ICON}" alt="" class="reveal" /><div class="head reveal">CuePoint</div><div class="sub reveal">${esc(s.line)}</div></div>
      ${s.by ? `<div class="mark reveal"><span>${esc(s.by)}</span></div>` : ""}`;
  } else if (s.type === "feature" || s.type === "still" || s.type === "wipe") {
    const after = s.type === "wipe" ? `<img class="pic after" alt="" /><div class="slider"></div>` : "";
    el.innerHTML = `${boxHtml(after)}<div class="shade"></div>
      <div class="top"><div class="eyebrow">${esc(s.label)}</div><div class="head">${esc(s.head)}</div>${s.sub ? `<div class="sub">${esc(s.sub)}</div>` : ""}</div>
      <div class="lower"><div class="eyebrow">${esc(s.label)}</div><div class="head">${esc(s.close ?? s.head)}</div></div>
      ${markHtml}${dotsHtml(s.dots)}`;
    if (film.topY) el.querySelector(".top").style.top = `${film.topY}px`;
  } else if (s.type === "doc") {
    el.innerHTML = `${boxHtml()}<div class="shade"></div><div class="lower"><div class="time">${esc(s.time)}</div><div class="head">${esc(s.head)}</div></div>${markHtml}`;
  } else if (s.type === "statement") {
    el.innerHTML = `${s.bg ? `<div class="bgpic"><img alt="" /></div>` : ""}<div class="say${s.one ? " one" : ""}">${s.lines.map((l) => `<div class="reveal ${l.cls ?? ""}">${s.one ? words(l.text) : esc(l.text)}</div>`).join("")}</div>`;
  } else if (s.type === "diagram") {
    el.innerHTML = `<div class="top"><div class="eyebrow reveal">How it's built</div><div class="head reveal" style="font-size:66px">${esc(s.head)}</div></div>
      <div class="layerbox reveal" style="top:440px"><b>React interface</b><span>TypeScript, one design system, every page tested</span></div>
      <div class="wire reveal" style="left:540px;top:572px;height:66px"></div><div class="wirelabel reveal" style="left:562px;top:590px">narrow preload bridge</div>
      <div class="layerbox reveal" style="top:650px"><b>Electron shell</b><span>supervises the engine and the player, safe updates, crash recovery</span></div>
      <div class="wire reveal" style="left:540px;top:782px;height:66px"></div><div class="wirelabel reveal" style="left:562px;top:800px">authenticated loopback HTTP + live events</div>
      <div class="layerbox reveal" style="top:860px"><b>Python engine</b><span>matching rules, Rekordbox XML, tags, backups and audit trail</span></div>
      <div class="wire reveal" style="left:224px;top:992px;height:66px"></div><div class="wire reveal" style="left:540px;top:992px;height:66px"></div><div class="wire reveal" style="left:856px;top:992px;height:66px"></div>
      <div class="layerbox small reveal" style="top:1070px;left:84px"><b>Beatport API</b></div><div class="layerbox small reveal" style="top:1070px;left:400px"><b>Rekordbox</b></div><div class="layerbox small reveal" style="top:1070px;left:716px"><b>mpv · FFmpeg</b></div>
      ${markHtml}`;
  } else if (s.type === "stats") {
    el.innerHTML = `<div class="top"><div class="eyebrow reveal">${esc(s.label)}</div></div><div class="rows">${s.rows.map((r) => `<div class="stat reveal"><b data-to="${r.to ?? ""}">${esc(r.big)}</b><span>${esc(r.text)}</span></div>`).join("")}</div>${markHtml}`;
  } else if (s.type === "end") {
    el.innerHTML = `<div class="centre"><img class="icon reveal" src="${ICON}" alt="" /><div class="name reveal">CuePoint</div><div class="line reveal">${esc(s.line)}</div>
      <div class="url reveal">usecuepoint.com</div>${s.git ? `<div class="git reveal">github.com/stuchain/CuePoint</div>` : ""}${s.by ? `<div class="by reveal">${esc(s.by)}</div>` : ""}</div>`;
  }
  $("stage").insertBefore(el, $("fade"));
  return el;
}
for (const s of scenes) s.el = build(s);

/** Elements that rise in one after another, `step` seconds apart from `from`. */
function rise(els, u, from, step, dist = 24) {
  els.forEach((el, i) => {
    const k = (u - from - i * step) / 0.6;
    el.style.opacity = String(smooth(k));
    el.style.transform = `translateY(${((1 - easeOut(k)) * dist).toFixed(1)}px)`;
  });
}

/** The framed window (912 wide under the headline) gliding to full bleed on the action as k goes 0 to 1. */
function glide(s, img, k, f, extra = 1) {
  const box = s.el.querySelector(".box");
  const x = lerp(40, 0, k);
  const y = lerp(film.winY ?? 560, 0, k);
  const w = lerp(1000, W, k);
  const h = lerp(625, H, k);
  Object.assign(box.style, {
    width: `${w}px`, height: `${h}px`, transform: `translate(${x}px, ${y}px)`,
    borderRadius: `${(14 * (1 - k)).toFixed(1)}px`,
    boxShadow: `0 40px 120px rgba(0,0,0,${(0.7 * (1 - k)).toFixed(2)}), 0 0 0 1px rgba(255,255,255,${(0.08 * (1 - k)).toFixed(3)})`,
  });
  const [fx, fy] = f ? f.focus : [640, 400];
  const z = lerp(1, f ? f.z : 1, k) * extra;
  for (const pic of box.querySelectorAll(".pic")) place(pic, w, h, lerp(640, fx, k), lerp(400, fy, k), z);
  return { w, h };
}

async function draw(s, t) {
  const u = t - s.start;
  const el = s.el;
  if (s.type === "title") {
    const f = byId[s.feature ?? "library"];
    const img = el.querySelector(".pic");
    await setSrc(img, featureSrc(f, u * 0.6));
    const box = el.querySelector(".box");
    Object.assign(box.style, { width: "912px", height: "570px", transform: `translate(84px, ${(680 - 30 * smooth(u / s.dur)).toFixed(1)}px) scale(${(1 + 0.03 * u / s.dur).toFixed(4)})`, borderRadius: "14px", opacity: String(0.95 * smooth((u - 0.4) / 1.2)) });
    place(img, 912, 570, 640, 400, 1);
    rise([...el.querySelectorAll(".reveal")], u, 0.2, BEAT);
  } else if (s.type === "feature" || s.type === "still" || s.type === "wipe") {
    // a scene may reframe its feature: its own clip start, clip speed, focus and zoom
    const f = s.feature
      ? { ...byId[s.feature], ...(s.from != null && { from: s.from }), ...(s.clipRate && { rate: s.clipRate }), ...(s.focus && { focus: s.focus }), ...(s.z && { z: s.z }) }
      : s.focus ? { focus: s.focus, z: s.z } : null;
    const pics = el.querySelectorAll(".pic");
    // fit: slow the clip so the scene ends on its last frame rather than holding on it
    const rate = s.fit ? Math.min(s.rate ?? 1, (CLIPS[f.id] / 30 - 0.3 - f.from) / (f.rate * (s.dur + FADE))) : (s.rate ?? 1);
    if (s.type === "feature") await setSrc(pics[0], featureSrc(f, u * rate));
    else {
      await setSrc(pics[0], `frames/${s.still}-before.png`);
      if (pics[1]) await setSrc(pics[1], `frames/${s.still}-after.png`);
    }
    // the window settles in, holds under its headline, then glides to the action
    const zoomAt = (s.zoomAt ?? 3) * BEAT;
    const k = s.zoom === false ? 0 : smooth((u - zoomAt) / 1.3);
    const settle = easeOut(u / 0.9);
    // a slow push-in under the headline too, so the window never sits still before the zoom
    const push = s.fit ? 0.04 * Math.min(u, zoomAt) / zoomAt : 0;
    glide(s, pics[0], k, s.zoom === false ? null : f, 1 + push + 0.06 * Math.max(0, u - zoomAt - 1.3) / s.dur);
    const box = el.querySelector(".box");
    box.style.transform += ` translateY(${((1 - settle) * 40).toFixed(1)}px)`;
    box.style.opacity = String(smooth(u / 0.5));
    const top = el.querySelector(".top");
    top.style.opacity = String(smooth(u / 0.6) * (1 - smooth(k * 2)));
    top.style.transform = `translateY(${((1 - easeOut(u / 0.8)) * 20).toFixed(1)}px)`;
    el.querySelector(".shade").style.opacity = String(k);
    const lower = el.querySelector(".lower");
    lower.style.opacity = String(smooth((k - 0.5) * 2));
    lower.style.transform = `translateY(${((1 - smooth((k - 0.5) * 2)) * 20).toFixed(1)}px)`;
    if (s.type === "wipe") {
      const p = smooth((u - (s.wipeAt ?? 1) * BEAT) / (s.wipeBeats ?? 3) / BEAT);
      const w = parseFloat(box.style.width);
      pics[1].style.clipPath = `inset(0 0 0 ${((1 - p) * 100).toFixed(2)}%)`;
      const slider = el.querySelector(".slider");
      slider.style.left = `${((1 - p) * w).toFixed(1)}px`;
      slider.style.opacity = String(p > 0 && p < 1 ? 1 : 0);
    }
  } else if (s.type === "doc") {
    const f = byId[s.feature];
    const pic = el.querySelector(".pic");
    await setSrc(pic, frameSrc(f.id, (s.from ?? f.from) + u * (s.rate ?? 1)));
    const box = el.querySelector(".box");
    Object.assign(box.style, { width: `${W}px`, height: `${H}px` });
    const z = f.z * lerp(s.z0 ?? 0.9, s.z1 ?? 1.0, smooth(u / s.dur));
    place(pic, W, H, f.focus[0], f.focus[1], z);
    rise([...el.querySelectorAll(".lower > *")], u, 0.5, 0.25);
  } else if (s.type === "statement") {
    if (s.bg) {
      const img = el.querySelector(".bgpic img");
      await setSrc(img, `frames/${s.bg}.png`);
      place(img, W, H, 760, 380, 2.2 + 0.1 * u / s.dur);
    }
    const lines = [...el.querySelectorAll(".say > div")];
    if (s.one) {
      // one sentence at a time: its words ease in from soft focus, then it lifts away as the next one starts
      lines.forEach((l, i) => {
        const from = (s.lines[i].at ?? i * 2) * BEAT;
        const next = s.lines[i + 1] ? s.lines[i + 1].at * BEAT : Infinity;
        const out = smooth((u - (next - 0.55)) / 0.5);
        l.style.opacity = String(1 - out);
        l.style.transform = `translateY(calc(-50% - ${(out * 18).toFixed(1)}px))`;
        l.style.filter = out > 0 ? `blur(${(out * 6).toFixed(2)}px)` : "";
        l.querySelectorAll(".w").forEach((w, j) => {
          const k = (u - from - 0.1 - j * 0.05) / 0.6;
          const e = easeOut(k);
          w.style.opacity = String(smooth(k));
          w.style.transform = `translateY(${((1 - e) * 14).toFixed(1)}px)`;
          w.style.filter = k < 1 ? `blur(${(Math.max(0, 1 - e) * 7).toFixed(2)}px)` : "";
        });
      });
      return;
    }
    lines.forEach((l, i) => {
      const from = (s.lines[i].at ?? i * 2) * BEAT;
      const k = (u - from) / 0.7;
      l.style.opacity = String(smooth(k));
      l.style.transform = `translateY(${((1 - easeOut(k)) * 26).toFixed(1)}px)`;
    });
  } else if (s.type === "diagram") {
    rise([...el.querySelectorAll(".reveal")], u, 0.1, s.step ?? BEAT / 2);
    el.querySelectorAll(".wire").forEach((w) => {
      w.style.transform = `scaleY(${Number(w.style.opacity).toFixed(3)})`;
    });
  } else if (s.type === "stats") {
    const rows = [...el.querySelectorAll(".reveal")];
    rise(rows, u, 0.1, BEAT * (s.step ?? 2));
    el.querySelectorAll(".stat").forEach((row, i) => {
      const b = row.querySelector("b");
      const to = Number(b.dataset.to);
      if (!to) return;
      const k = easeOut((u - 0.1 - (i + 1) * BEAT * (s.step ?? 2)) / 1.2);
      b.textContent = `${Math.round(to * k).toLocaleString("en-US")}+`;
    });
  } else if (s.type === "end") {
    rise([...el.querySelectorAll(".reveal")], u, 0.1, BEAT / 2);
  }
}

async function seek(t) {
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const on = t >= s.start && t < s.start + s.dur + FADE && (i === scenes.length - 1 ? true : t < scenes[i + 1].start + FADE);
    s.el.style.display = on ? "block" : "none";
    if (!on) continue;
    s.el.style.opacity = i === 0 ? "1" : String(smooth((t - s.start) / FADE));
    // pages of words drift in slowly so nothing ever sits still
    const still = ["statement", "diagram", "stats", "end", "title"].includes(s.type);
    s.el.style.transform = still ? `scale(${(1 + 0.04 * (t - s.start) / s.dur).toFixed(5)})` : "";
    await draw(s, t);
  }
  $("fade").style.opacity = String(Math.max(1 - smooth(t / 0.6), smooth((t - (DURATION - 1.4)) / 1.4)));
}

await document.fonts.ready;
window.__film = { seek, duration: DURATION, fps: FPS, poster: film.poster ?? 8 };
document.documentElement.dataset.ready = "1";
