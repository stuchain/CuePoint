import type { gsap } from "gsap";
import markUrl from "../../desktop-electron/build/icon-source/mark-32.svg?url";
import { APP_PREVIEW, CLEAN_ROWS, keyColor, SET } from "./content";
import type { FormatId } from "./formats";
import { at, BEAT, CAPTIONS, shot } from "./timing";

type Timeline = gsap.core.Timeline;

/**
 * The app shots are stand-ins drawn in the app's own pixel style, marked "Preview", until the
 * redesigned pages (Phase 14 and 15) can be captured from the real app (SITE-04's capture script).
 */

const h = (html: string): HTMLElement => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const POP = { scale: 0, opacity: 0 };
const IN = { scale: 1, opacity: 1, duration: BEAT / 2, ease: "steps(3)" };

/** Where the window and the captions sit in each cut. */
const FRAME = {
  wide: { window: { left: 120, top: 60, width: 1680, height: 820 }, caption: 920 },
  tall: { window: { left: 40, top: 230, width: 1000, height: 1120 }, caption: 1500 },
} as const;

function windowShell(format: FormatId, active: string, page: string): HTMLElement {
  const w = FRAME[format].window;
  const nav = ["Library", "Clean", "Keys", "Discover", "Prepare"]
    .map((n) => `<div class="${n === active ? "is-active" : ""}">${n}</div>`)
    .join("");
  return h(`
    <div class="window px-panel" style="left:${w.left}px;top:${w.top}px;width:${w.width}px;height:${w.height}px">
      <div class="window__bar">
        <img src="${markUrl}" alt="" /><span>CuePoint</span>
        ${APP_PREVIEW ? `<span class="px-badge">Preview</span>` : ""}
        <span class="spacer"></span>
        <span class="window__dots"><i></i><i></i><i></i></span>
      </div>
      <div class="window__body">
        <nav class="sidebar">${nav}</nav>
        <div class="page">${page}</div>
      </div>
    </div>`);
}

const keyBadge = (key: string): string =>
  key === "—" ? `<span class="missing">—</span>` : `<span class="key" style="background:${keyColor(key)}">${key}</span>`;

const cellHtml = (cls: string, oldV: string, newV: string | undefined, render: (v: string) => string = esc): string => {
  if (newV === undefined) return `<span class="cell ${cls}"><span class="old ${oldV === "—" ? "missing" : ""}">${render(oldV)}</span></span>`;
  return `<span class="cell ${cls}"><span class="old ${oldV === "—" ? "missing" : ""}">${render(oldV)}</span><span class="new">${render(newV)}</span></span>`;
};

// ---- Clean: match on Beatport, the values fill in ----

function buildClean(format: FormatId, tl: Timeline): HTMLElement {
  const rows = CLEAN_ROWS.map(
    (r) => `
    <div class="row ${r.status === "matched" ? "is-bad" : ""}">
      <span class="c-title">${esc(r.title)}</span>
      <span class="c-artist">${esc(r.artist)}</span>
      ${cellHtml("c-key", r.key[0], r.key[1], keyBadge)}
      ${cellHtml("c-bpm", r.bpm[0], r.bpm[1])}
      ${cellHtml("c-genre", r.genre[0], r.genre[1])}
      <span class="status cell"><span class="new ${r.status === "matched" ? "ok" : "review"}">${
        r.status === "matched" ? "Matched" : "To review"
      }</span></span>
    </div>`,
  ).join("");
  const page = `
    <div class="page__head"><h2>Clean</h2><p>Fix values with Beatport</p></div>
    <div class="toolbar">
      <span class="px-button">Match on Beatport</span>
      <div class="px-progress"><i></i></div>
      <span class="count">Ready</span>
    </div>
    <div class="table">
      <div class="row head"><span class="c-title">Title</span><span class="c-artist">Artist</span><span>Key</span><span>BPM</span><span class="c-genre">Genre</span><span>Status</span></div>
      ${rows}
    </div>`;
  const el = h(`<div class="layer shot-clean"></div>`);
  el.append(windowShell(format, "Clean", page));

  const { start } = shot("clean");
  const button = el.querySelector(".px-button")!;
  const bar = el.querySelector(".px-progress > i")!;
  const count = el.querySelector(".count")!;
  const rowEls = [...el.querySelectorAll<HTMLElement>(".row:not(.head)")];

  // the window steps up into place under the wipe
  tl.from(el.querySelector(".window"), { y: 80, duration: BEAT, ease: "steps(4)" }, start);
  tl.set(button, { attr: { "data-pressed": "1" } }, at(5, 1));
  tl.set(button, { attr: { "data-pressed": "0" } }, at(5, 1.5));
  const first = at(5, 2);
  const step = BEAT;
  const n = rowEls.length;
  tl.to(bar, { width: "100%", duration: step * n, ease: `steps(${n * 4})` }, first);
  const counter = { v: 0 };
  tl.to(
    counter,
    {
      v: n,
      duration: step * n,
      ease: `steps(${n})`,
      onUpdate: () => {
        count.textContent = `Matching ${Math.round(counter.v)} of ${n}`;
      },
    },
    first,
  );
  rowEls.forEach((row, i) => {
    const t = first + step * (i + 1) - step / 2;
    const news = row.querySelectorAll(".cell .new, .status .new");
    const changed = [...row.querySelectorAll(".cell")].filter((c) => c.querySelector(".new"))
      .map((c) => c.querySelector(".old"))
      .filter((o) => o !== null);
    tl.to(changed, { opacity: 0, duration: BEAT / 4, ease: "steps(2)" }, t);
    tl.fromTo(news, { ...POP }, { ...IN }, t);
    if (row.classList.contains("is-bad")) tl.to(row, { backgroundColor: "rgba(0,0,0,0)", duration: BEAT / 2, ease: "steps(2)" }, t);
  });
  const matched = CLEAN_ROWS.filter((r) => r.status === "matched").length;
  tl.call(
    () => {
      count.textContent = `${matched} matched, ${n - matched} to review`;
    },
    [],
    first + step * n + BEAT / 4,
  );
  return el;
}

// ---- Prepare: a set in key, with a waveform playing ----

function waveSvg(): string {
  // a made-up track's three bands, as whole-pixel columns (deterministic, so every render matches)
  const cols = 160;
  let low = "";
  let mid = "";
  let high = "";
  for (let i = 0; i < cols; i++) {
    const beat = i % 8 === 0 ? 1 : i % 4 === 0 ? 0.7 : 0.35;
    const swell = 0.55 + 0.45 * Math.sin(i / 11) * Math.sin(i / 3.7);
    const breakdown = i > 96 && i < 116 ? 0.3 : 1;
    const l = Math.round(40 * beat * breakdown + 6);
    const m = Math.round(26 * Math.abs(swell) + 4);
    const hh = Math.round(14 * (0.5 + 0.5 * Math.sin(i * 1.7)) + 3);
    const x = i * 5;
    low += `<rect x="${x}" y="${75 - l}" width="4" height="${l * 2}"/>`;
    mid += `<rect x="${x}" y="${75 - m}" width="4" height="${m * 2}"/>`;
    high += `<rect x="${x}" y="${75 - hh}" width="4" height="${hh * 2}"/>`;
  }
  return `<svg viewBox="0 0 800 150" preserveAspectRatio="none" shape-rendering="crispEdges">
    <g fill="var(--waveform-low)">${low}</g><g fill="var(--waveform-mid)">${mid}</g><g fill="var(--waveform-high)">${high}</g></svg>`;
}

function buildPrepare(format: FormatId, tl: Timeline): HTMLElement {
  const slots = SET.map(
    (s, i) => `
      <div class="slot"><span class="n">${i + 1}</span><span>${esc(s.title)}</span><span class="bpm">${s.bpm}</span>${keyBadge(s.key)}</div>
      ${i < SET.length - 1 ? `<div class="link"><i></i>${s.key} to ${SET[i + 1]!.key}: mixes in key</div>` : ""}`,
  ).join("");
  const page = `
    <div class="page__head"><h2>Prepare</h2><p>Plan a set</p><span class="px-badge">Friday warm-up</span></div>
    <div class="wave">${waveSvg()}<div class="played"></div><div class="head"></div></div>
    <div class="order">${slots}</div>`;
  const el = h(`<div class="layer shot-prepare"></div>`);
  el.append(windowShell(format, "Prepare", page));

  const { start } = shot("prepare");
  const end = shot("export").end;
  tl.from(el.querySelector(".window"), { y: 80, duration: BEAT, ease: "steps(4)" }, start);
  // the playhead walks across the track in whole steps, one per beat
  const beats = Math.round((end - start) / BEAT);
  tl.fromTo(el.querySelector(".wave .head"), { left: "4%" }, { left: "78%", duration: end - start, ease: `steps(${beats * 2})` }, start);
  tl.fromTo(el.querySelector(".wave .played"), { width: "4%" }, { width: "78%", duration: end - start, ease: `steps(${beats * 2})` }, start);
  const slotEls = el.querySelectorAll(".slot");
  const linkEls = el.querySelectorAll(".link");
  slotEls.forEach((s, i) => tl.from(s, { x: -60, opacity: 0, duration: BEAT / 2, ease: "steps(3)" }, at(8, 1 + i)));
  linkEls.forEach((l, i) => tl.from(l, { opacity: 0, scale: 0.6, duration: BEAT / 2, ease: "steps(3)" }, at(9, 1 + i * 1.5)));
  return el;
}

// ---- Export: back to Rekordbox, over the set ----

function buildExport(format: FormatId, tl: Timeline): HTMLElement {
  const wide = format === "wide";
  const width = wide ? 980 : 940;
  const left = wide ? (1920 - width) / 2 : (1080 - width) / 2;
  const top = wide ? 200 : 520;
  const el = h(`
    <div class="layer shot-export">
      <div class="dim"></div>
      <div class="dialog px-panel" style="left:${left}px;top:${top}px;width:${width}px">
        <h3>Export to Rekordbox</h3>
        <div class="inner">
          <div class="field">CuePoint library.xml</div>
          <div class="check"><b></b><span>Keep my own values on top</span></div>
          <div class="px-progress"><i></i></div>
          <div class="actions"><span class="px-button">Export</span></div>
        </div>
      </div>
      <div class="toast" style="left:${wide ? 1230 : 120}px;top:${wide ? 760 : 1290}px">Ready for Rekordbox</div>
    </div>`);
  const { start } = shot("export");
  tl.to(el.querySelector(".dim"), { opacity: 1, duration: BEAT / 2, ease: "steps(3)" }, start);
  tl.from(el.querySelector(".dialog"), { y: -140, opacity: 0, duration: BEAT, ease: "steps(4)" }, start);
  const button = el.querySelector(".px-button")!;
  tl.set(button, { attr: { "data-pressed": "1" } }, at(11, 3));
  tl.set(button, { attr: { "data-pressed": "0" } }, at(11, 3.5));
  tl.to(el.querySelector(".px-progress > i"), { width: "100%", duration: BEAT * 3, ease: "steps(12)" }, at(12, 0));
  tl.fromTo(el.querySelector(".toast"), { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: BEAT / 2, ease: "steps(3)" }, at(12, 3));
  return el;
}

// ---- The end card: the mark in a ring of the 24 keys ----

function buildEnd(format: FormatId, tl: Timeline): HTMLElement {
  const wide = format === "wide";
  const markPx = wide ? 288 : 352; // whole multiples of the 32-pixel mark
  const radius = wide ? 330 : 380; // the outer (B) ring; the inner (A) ring clears the mark's corners
  const inner = wide ? 245 : 290;
  const box = radius * 2 + 90;
  const keys = Array.from({ length: 24 }, (_, i) => {
    // 12 at the top, outer ring B, inner ring A, like the wheel
    const n = (i % 12) + 1;
    const ring = i < 12 ? "B" : "A";
    const r = ring === "B" ? radius : inner;
    const a = ((n - 1) / 12) * Math.PI * 2 - Math.PI / 2 + Math.PI / 6;
    const x = box / 2 + Math.cos(a) * r;
    const y = box / 2 + Math.sin(a) * r;
    return `<span class="k" style="left:${x}px;top:${y}px;background:${keyColor(`${n}${ring}`)}">${n}${ring}</span>`;
  }).join("");
  const el = h(`
    <div class="layer end" style="flex-direction:${wide ? "row" : "column"};gap:${wide ? 90 : 40}px">
      <div class="ring" style="width:${box}px;height:${box}px">
        <img src="${markUrl}" alt="" style="position:absolute;width:${markPx}px;height:${markPx}px;left:${(box - markPx) / 2}px;top:${(box - markPx) / 2}px" />
        ${keys}
      </div>
      <div style="display:flex;flex-direction:column;align-items:${wide ? "flex-start" : "center"};gap:30px">
        <h1>CuePoint</h1>
        <p style="text-align:${wide ? "left" : "center"};max-width:${wide ? 760 : 960}px">Your Rekordbox library, cleaned up and ready for the booth.</p>
        <span class="px-button url">usecuepoint.com</span>
      </div>
    </div>`);
  const { start } = shot("end");
  tl.from(el.querySelector(".ring img"), { scale: 0, duration: BEAT, ease: "steps(4)" }, start);
  // the keys light around the wheel, three to a beat, then the whole ring holds lit
  el.querySelectorAll(".k").forEach((k, i) => {
    tl.to(k, { opacity: 1, duration: BEAT / 6, ease: "steps(1)" }, start + BEAT + (i * BEAT) / 3);
  });
  tl.from(el.querySelector("h1"), { y: 50, opacity: 0, duration: BEAT / 2, ease: "steps(3)" }, at(13, 2));
  tl.from(el.querySelector("p"), { y: 30, opacity: 0, duration: BEAT / 2, ease: "steps(3)" }, at(14, 0));
  tl.from(el.querySelector(".url"), { scale: 0, opacity: 0, duration: BEAT / 2, ease: "steps(3)" }, at(14, 2));
  return el;
}

// ---- captions and the pixel wipe ----

function buildCaptions(format: FormatId, tl: Timeline): HTMLElement {
  const el = h(`<div class="layer captions"></div>`);
  for (const c of CAPTIONS) {
    const cap = h(`<div class="caption" style="top:${FRAME[format].caption}px">${esc(c.text)}</div>`);
    el.append(cap);
    tl.fromTo(cap, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: BEAT / 2, ease: "steps(3)" }, c.from);
    tl.to(cap, { opacity: 0, duration: BEAT / 4, ease: "steps(2)" }, c.to - BEAT / 4);
  }
  return el;
}

/** Blocks fill the screen from the middle out, the shot changes underneath, and they clear. */
function buildWipe(format: FormatId, tl: Timeline, cuts: readonly number[]): HTMLElement {
  const cols = format === "wide" ? 16 : 9;
  const rows = format === "wide" ? 9 : 16;
  const el = h(`<div class="layer wipe" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr)"></div>`);
  for (let i = 0; i < cols * rows; i++) el.append(document.createElement("i"));
  const cells = el.querySelectorAll("i");
  for (const cut of cuts) {
    tl.to(cells, { scale: 1.02, duration: BEAT / 4, ease: "steps(2)", stagger: { grid: [rows, cols], from: "center", amount: BEAT / 2 } }, cut - (BEAT * 3) / 4);
    tl.to(cells, { scale: 0, duration: BEAT / 4, ease: "steps(2)", stagger: { grid: [rows, cols], from: "center", amount: BEAT / 2 } }, cut);
  }
  return el;
}

/** Builds every layer onto the stage and its tweens onto the timeline. Returns the opening's host. */
export function buildShots(stage: HTMLElement, format: FormatId, tl: Timeline): { openingHost: HTMLElement } {
  const openingHost = h(`<div class="layer shot-opening"></div>`);
  const clean = buildClean(format, tl);
  const prepare = buildPrepare(format, tl);
  const exp = buildExport(format, tl);
  const end = buildEnd(format, tl);
  const layers: Array<[HTMLElement, number, number]> = [
    [openingHost, shot("opening").start, shot("opening").end],
    [clean, shot("clean").start, shot("clean").end],
    [prepare, shot("prepare").start, shot("export").end],
    [exp, shot("export").start, shot("export").end],
    [end, shot("end").start, shot("end").end],
  ];
  for (const [el, from, to] of layers) {
    stage.append(el);
    tl.set(el, { visibility: "hidden" }, 0);
    tl.set(el, { visibility: "visible" }, from);
    if (to < shot("end").end) tl.set(el, { visibility: "hidden" }, to);
  }
  stage.append(buildCaptions(format, tl));
  stage.append(buildWipe(format, tl, [shot("clean").start, shot("prepare").start, shot("end").start]));
  return { openingHost };
}
