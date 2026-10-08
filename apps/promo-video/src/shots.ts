import type { gsap } from "gsap";
import markUrl from "../../desktop-electron/build/icon-source/mark-32.svg?url";
import { APP_PREVIEW, CLEAN_ROWS, keyColor, mixesInKey, SET } from "./content";
import type { FormatId } from "./formats";
import { at, BEAT, CAPTIONS, CUTS, FINAL_HIT, shot } from "./timing";

type Timeline = gsap.core.Timeline;

/**
 * The app shots are stand-ins drawn in the app's own pixel style, marked "Preview", until the
 * redesigned pages (Phase 14 and 15) can be captured from the real app (SITE-04's capture script).
 * Each sits in its own CSS 3D space: the camera swoops in, drifts, and flies out past the viewer.
 */

/** A shot's 3D space: perspective on the outside, a rig the camera moves inside. */
function space(cls: string, perspective = 1800): { el: HTMLElement; rig: HTMLElement } {
  const el = h(`<div class="layer ${cls}"><div class="space" style="perspective:${perspective}px"><div class="rig"></div></div></div>`);
  return { el, rig: el.querySelector(".rig")! };
}

/** Swoop the rig in from deep space, drift it across the shot, and throw it past the camera. */
function swoop(tl: Timeline, rig: Element, start: number, end: number, from: gsap.TweenVars, rest: gsap.TweenVars, drift: gsap.TweenVars): void {
  tl.fromTo(rig, { z: -2600, ...from }, { z: 0, ...rest, duration: BEAT * 1.25, ease: "power3.out" }, start);
  tl.to(rig, { ...drift, duration: end - start - BEAT * 2.25, ease: "sine.inOut" }, start + BEAT * 1.25);
  tl.to(rig, { z: 1400, rotationY: "+=25", duration: BEAT, ease: "power3.in" }, end - BEAT);
}

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

/**
 * Words that change over time, as stacked spans switched with tl.set: every frame depends only on the
 * time it is drawn at, whichever way the timeline was seeked to get there.
 */
function textTrack(host: Element, tl: Timeline, steps: ReadonlyArray<readonly [number, string]>): void {
  host.classList.add("track");
  const spans = steps.map(([, text], i) => {
    const span = h(`<span${i === 0 ? ' class="is-first"' : ""}>${esc(text)}</span>`);
    host.append(span);
    return span;
  });
  steps.forEach(([t], i) => {
    if (i === 0) return;
    tl.set(spans[i - 1]!, { display: "none" }, t);
    tl.set(spans[i]!, { display: "block" }, t);
  });
}

function buildClean(format: FormatId, tl: Timeline): HTMLElement {
  // a match gives the track Beatport's key and nothing else; tempo and genre come only from Apply
  // (docs/user-guide/clean.md, "Accepting a match gives the track its key and changes no other value")
  const rows = CLEAN_ROWS.map(
    (r) => `
    <div class="row ${r.key[1] !== undefined ? "is-bad" : ""}">
      <span class="c-title">${esc(r.title)}</span>
      <span class="c-artist">${esc(r.artist)}</span>
      ${cellHtml("c-key", r.key[0], r.key[1], keyBadge)}
      ${cellHtml("c-bpm apply", r.bpm[0], r.bpm[1])}
      ${cellHtml("c-genre apply", r.genre[0], r.genre[1])}
      <span class="status cell"><span class="new ${r.status === "accepted" ? "ok" : "review"}">${
        r.status === "accepted" ? "Accepted" : "Needs review"
      }</span></span>
    </div>`,
  ).join("");
  const page = `
    <div class="page__head"><h2>Clean</h2><p>Fix values with Beatport</p></div>
    <div class="toolbar">
      <span class="px-button match">Match all</span>
      <div class="px-progress"><i></i></div>
      <span class="count"></span>
      <span class="px-button apply">Apply</span>
    </div>
    <div class="table">
      <div class="row head"><span class="c-title">Title</span><span class="c-artist">Artist</span><span>Key</span><span>BPM</span><span class="c-genre">Genre</span><span>Status</span></div>
      ${rows}
    </div>`;
  const { el, rig } = space("shot-clean");
  rig.append(windowShell(format, "Clean", page));

  const { start, end } = shot("clean");
  const match = el.querySelector(".px-button.match")!;
  const apply = el.querySelector(".px-button.apply")!;
  const bar = el.querySelector(".px-progress > i")!;
  const rowEls = [...el.querySelectorAll<HTMLElement>(".row:not(.head)")];
  const n = rowEls.length;
  const accepted = CLEAN_ROWS.filter((r) => r.status === "accepted").length;

  swoop(tl, rig, start, end, { rotationY: -55, rotationX: 25 }, { rotationY: -16, rotationX: 9 }, { rotationY: 12, rotationX: 4 });
  tl.set(match, { attr: { "data-pressed": "1" } }, at(3, 1));
  tl.set(match, { attr: { "data-pressed": "0" } }, at(3, 1.5));
  const first = at(3, 1.5);
  const step = BEAT / 2;
  tl.to(bar, { width: "100%", duration: step * n, ease: `steps(${n * 4})` }, first);
  const matchedAt = (i: number): number => first + step * (i + 1) - step / 2;
  const applyAt = at(4, 3);
  textTrack(el.querySelector(".count")!, tl, [
    [0, "Ready"],
    ...rowEls.map((_, i) => [matchedAt(i), `Matching ${i + 1} of ${n}`] as const),
    [first + step * n, `${accepted} accepted, ${n - accepted} to review`],
    [applyAt + BEAT / 2, `Applied to ${accepted} tracks`],
  ]);

  const oldOf = (cells: Element[]): Element[] => cells.map((c) => c.querySelector(".old")).filter((o): o is Element => o !== null);
  rowEls.forEach((row, i) => {
    const t = matchedAt(i);
    const keyCell = [...row.querySelectorAll(".c-key")].filter((c) => c.querySelector(".new"));
    tl.to(oldOf(keyCell), { opacity: 0, duration: BEAT / 4, ease: "steps(2)" }, t);
    tl.fromTo(row.querySelectorAll(".c-key .new, .status .new"), { scale: 2.4, opacity: 0 }, { ...IN }, t);
    if (row.classList.contains("is-bad")) tl.to(row, { backgroundColor: "rgba(0,0,0,0)", duration: BEAT / 2, ease: "steps(2)" }, t);
  });
  // Apply from the accepted matches: tempo and genre, row by row
  tl.from(apply, { scale: 0, opacity: 0, duration: BEAT / 2, ease: "steps(3)" }, at(4, 2));
  tl.set(apply, { attr: { "data-pressed": "1" } }, applyAt);
  tl.set(apply, { attr: { "data-pressed": "0" } }, applyAt + BEAT / 2);
  rowEls.forEach((row, i) => {
    const t = applyAt + BEAT / 2 + (i * BEAT) / 6;
    const cells = [...row.querySelectorAll(".apply")].filter((c) => c.querySelector(".new"));
    if (cells.length === 0) return;
    tl.to(oldOf(cells), { opacity: 0, duration: BEAT / 4, ease: "steps(2)" }, t);
    tl.fromTo(cells.map((c) => c.querySelector(".new")!), { ...POP }, { ...IN }, t);
  });
  return el;
}

// ---- Keys: the wheel as a floor, the 24 keys rising around it ----

function buildKeys(format: FormatId, tl: Timeline): HTMLElement {
  const wide = format === "wide";
  const mark = wide ? 896 : 768; // whole multiples of the 32-pixel mark
  const rA = mark * 0.64;
  const rB = rA + (wide ? 130 : 116);
  const { el, rig } = space("shot-keys", 1400);
  const tiles = Array.from({ length: 24 }, (_, i) => {
    const n = (i % 12) + 1;
    const ring = i < 12 ? "B" : "A";
    const r = ring === "B" ? rB : rA;
    const a = (n / 12) * Math.PI * 2 - Math.PI / 2;
    return `<span class="tile" data-key="${n}${ring}" style="left:${Math.cos(a) * r}px;top:${Math.sin(a) * r}px;background:${keyColor(`${n}${ring}`)}">${n}${ring}</span>`;
  }).join("");
  rig.innerHTML = `<div class="disc"><img src="${markUrl}" alt="" style="width:${mark}px;height:${mark}px;margin:${-mark / 2}px 0 0 ${-mark / 2}px" />${tiles}</div>`;
  const disc = rig.querySelector(".disc")!;
  const { start, end } = shot("keys");
  // the disc tilts down into a floor and turns under the camera
  tl.fromTo(disc, { rotationX: 0, rotationZ: -90, scale: 0.2, y: wide ? 0 : 60 }, { rotationX: 58, rotationZ: -20, scale: 1, duration: BEAT * 1.25, ease: "power3.out" }, start);
  tl.to(disc, { rotationZ: 25, duration: end - start - BEAT * 1.25, ease: "sine.inOut" }, start + BEAT * 1.25);
  const tileEls = [...el.querySelectorAll<HTMLElement>(".tile")];
  // all 24 rise in a sweep round the wheel, then the keys that mix with 8A stand tall
  const order = [...tileEls].sort((a, b) => Number.parseInt(a.dataset["key"]!, 10) - Number.parseInt(b.dataset["key"]!, 10));
  order.forEach((tile, i) => tl.fromTo(tile, { z: 0, opacity: 0.25 }, { z: 36, opacity: 1, duration: BEAT / 4, ease: "steps(2)" }, start + BEAT + (i * BEAT) / 8));
  const lift = at(7, 0);
  for (const tile of tileEls) {
    const key = tile.dataset["key"]!;
    if (key === "8A") tl.to(tile, { z: 170, scale: 1.5, duration: BEAT / 2, ease: "steps(3)" }, lift);
    else if (mixesInKey("8A", key)) tl.to(tile, { z: 120, scale: 1.25, duration: BEAT / 2, ease: "steps(3)" }, lift + BEAT / 2);
    else tl.to(tile, { opacity: 0.3, duration: BEAT / 4, ease: "steps(2)" }, lift);
  }
  tl.to(rig, { z: 1600, duration: BEAT, ease: "power3.in" }, end - BEAT);
  return el;
}

// ---- Prepare: fly down the running order, every step in key ----

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
  const wide = format === "wide";
  const GAP = 900;
  const swing = wide ? 300 : 70;
  const { el, rig } = space("shot-prepare", 1300);
  const cards = SET.map((s, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    return `<div class="card px-panel" style="--x:${side * swing}px;--z:${-i * GAP}px;--ry:${-side * 16}deg">
        <span class="n">${i + 1}</span><span class="t">${esc(s.title)}</span><span class="bpm">${s.bpm} BPM</span>${keyBadge(s.key)}
      </div>`;
  }).join("");
  const links = SET.slice(1)
    .map((s, i) => `<div class="link3d" style="--z:${-(i + 0.5) * GAP}px"><i></i>${SET[i]!.key} to ${s.key}: mixes in key</div>`)
    .join("");
  rig.innerHTML = cards + links;
  const hud = h(`
    <div class="hud px-panel">
      <div class="page__head"><h2>Prepare</h2><p>Plan a set</p><span class="px-badge">Friday warm-up</span>${APP_PREVIEW ? `<span class="px-badge preview">Preview</span>` : ""}</div>
      <div class="wave">${waveSvg()}<div class="played"></div><div class="head"></div></div>
    </div>`);
  el.append(hud);

  const { start, end } = shot("prepare");
  tl.from(hud, { y: -300, duration: BEAT, ease: "steps(4)" }, start);
  // the camera arrives at each card on the beat and glides between them
  tl.fromTo(rig, { z: -1800, rotationX: 12 }, { z: 0, rotationX: 6, duration: BEAT, ease: "power3.out" }, start);
  for (let i = 1; i < SET.length; i++) tl.to(rig, { z: i * GAP, duration: BEAT * 0.9, ease: "power3.inOut" }, start + BEAT * (2 * i - 1) + BEAT * 0.1);
  tl.to(rig, { z: SET.length * GAP + 600, duration: BEAT, ease: "power3.in" }, end - BEAT);
  const beats = Math.round((end - start) / BEAT);
  tl.fromTo(hud.querySelector(".wave .head"), { left: "6%" }, { left: "70%", duration: end - start, ease: `steps(${beats * 2})` }, start);
  tl.fromTo(hud.querySelector(".wave .played"), { width: "6%" }, { width: "70%", duration: end - start, ease: `steps(${beats * 2})` }, start);
  el.querySelectorAll(".link3d").forEach((l, i) => tl.from(l, { scale: 0, opacity: 0, duration: BEAT / 2, ease: "steps(3)" }, start + BEAT * (2 * i + 1)));
  return el;
}

// ---- Export: back to Rekordbox, the file flying out at the camera ----

function buildExport(format: FormatId, tl: Timeline): HTMLElement {
  const wide = format === "wide";
  const width = wide ? 1100 : 980;
  const { el, rig } = space("shot-export", 1600);
  rig.innerHTML = `
      <div class="dialog px-panel" style="width:${width}px;margin-left:${-width / 2}px">
        <h3>Export to Rekordbox</h3>
        <div class="inner">
          <div class="field">CuePoint library.xml</div>
          <div class="preview"><b>Preview</b><span>Your own key, BPM and genre go with every track.</span></div>
          <div class="px-progress"><i></i></div>
          <div class="actions"><span class="px-button">Export ${CLEAN_ROWS.length} tracks</span></div>
        </div>
      </div>
      <div class="file"><b>XML</b></div>`;
  el.append(h(`<div class="toast" style="${wide ? "right:140px;bottom:230px" : "left:60px;right:60px;bottom:520px;justify-content:center"}">Ready for Rekordbox</div>`));
  const { start, end } = shot("export");
  swoop(tl, rig, start, end, { rotationX: -70, rotationY: 20 }, { rotationX: 10, rotationY: -8 }, { rotationX: 4, rotationY: 10 });
  const button = el.querySelector(".px-button")!;
  tl.set(button, { attr: { "data-pressed": "1" } }, at(10, 1.5));
  tl.set(button, { attr: { "data-pressed": "0" } }, at(10, 2));
  tl.to(el.querySelector(".px-progress > i"), { width: "100%", duration: BEAT * 2, ease: "steps(10)" }, at(10, 2));
  // the file leaves the dialog and flies through the camera
  tl.fromTo(el.querySelector(".file"), { z: -200, opacity: 0, rotationY: 0 }, { z: 1500, opacity: 1, rotationY: 540, duration: BEAT * 1.5, ease: "power2.in" }, at(11, 0));
  tl.fromTo(el.querySelector(".toast"), { scale: 3, rotation: -8, opacity: 0 }, { scale: 1, rotation: -3, opacity: 1, duration: BEAT / 2, ease: "steps(3)" }, at(11, 1));
  return el;
}

// ---- The end card, over the site's 3D wheel turning behind it ----

function buildEnd(format: FormatId, tl: Timeline): HTMLElement {
  const wide = format === "wide";
  const markPx = wide ? 192 : 224;
  const letters = [..."CuePoint"].map((c) => `<span>${c}</span>`).join("");
  const el = h(`
    <div class="layer end-card">
      <div class="end-panel">
        <img class="end-mark" src="${markUrl}" alt="" style="width:${markPx}px;height:${markPx}px" />
        <h1>${letters}</h1>
        <p>Your Rekordbox library, cleaned up and ready for the booth.</p>
        <span class="px-button url">usecuepoint.com</span>
      </div>
    </div>`);
  const { start } = shot("end");
  tl.fromTo(el.querySelector(".end-mark"), { scale: 5, rotation: -30, opacity: 0 }, { scale: 1, rotation: 0, opacity: 1, duration: BEAT, ease: "steps(5)" }, start + BEAT);
  el.querySelectorAll("h1 span").forEach((s, i) => {
    tl.fromTo(s, { rotationX: -100, y: -80, opacity: 0 }, { rotationX: 0, y: 0, opacity: 1, duration: BEAT / 2, ease: "back.out(2)" }, at(12, 3) + (i * BEAT) / 4);
  });
  tl.from(el.querySelector("p"), { y: 40, opacity: 0, duration: BEAT / 2, ease: "steps(3)" }, at(14, 0));
  tl.fromTo(el.querySelector(".url"), { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: BEAT / 2, ease: "back.out(3)" }, at(14, 2));
  // the last hit: everything punches
  tl.fromTo(el.querySelector(".end-panel"), { scale: 1.12 }, { scale: 1, duration: BEAT, ease: "power2.out" }, FINAL_HIT);
  return el;
}

// ---- captions, flashes ----

function buildCaptions(format: FormatId, tl: Timeline): HTMLElement {
  const el = h(`<div class="layer captions"></div>`);
  for (const c of CAPTIONS) {
    const cap = h(`<div class="caption" style="top:${FRAME[format].caption}px">${esc(c.text)}</div>`);
    el.append(cap);
    tl.fromTo(cap, { opacity: 0, scale: 1.6, rotation: -4 }, { opacity: 1, scale: 1, rotation: -1.5, duration: BEAT / 2, ease: "steps(3)" }, c.from);
    tl.to(cap, { opacity: 0, scale: 0.8, duration: BEAT / 4, ease: "steps(2)" }, c.to - BEAT / 4);
  }
  return el;
}

/** A frame of light on every cut and on the last hit. */
function buildFlash(tl: Timeline): HTMLElement {
  const el = h(`<div class="layer flash"></div>`);
  for (const t of [...CUTS, FINAL_HIT]) tl.fromTo(el, { opacity: 0.9 }, { opacity: 0, duration: BEAT / 2, ease: "steps(3)", immediateRender: false }, t);
  return el;
}

/** Shows a layer only between `from` and `to` (the opening's layer is shown from the first frame). */
function showBetween(tl: Timeline, el: HTMLElement, ranges: ReadonlyArray<readonly [number, number]>): void {
  // .shot starts hidden in CSS; a set at time 0 would never render from a paused timeline at 0
  const [first] = ranges;
  if (first && first[0] > 0) el.classList.add("shot");
  for (const [from, to] of ranges) {
    if (from > 0) tl.set(el, { visibility: "visible" }, from);
    if (to < shot("end").end) tl.set(el, { visibility: "hidden" }, to);
  }
}

export interface Hosts {
  /** Where the site's 3D scene canvas goes (the opening and the end card). */
  readonly sceneHost: HTMLElement;
  /** Where the pixel backdrop canvas goes (behind the app shots). */
  readonly backdropHost: HTMLElement;
  /** Everything that shakes with the kick (not the captions). */
  readonly world: HTMLElement;
}

/** Builds every layer onto the stage and its tweens onto the timeline. */
export function buildShots(stage: HTMLElement, format: FormatId, tl: Timeline): Hosts {
  const world = h(`<div class="layer world"></div>`);
  stage.append(world);
  const sceneHost = h(`<div class="layer scene-host"></div>`);
  const backdropHost = h(`<div class="layer backdrop-host"></div>`);
  world.append(sceneHost, backdropHost);
  showBetween(tl, sceneHost, [
    [0, shot("opening").end],
    [shot("end").start, shot("end").end],
  ]);
  showBetween(tl, backdropHost, [[shot("clean").start, shot("end").start]]);
  const shots: Array<[HTMLElement, number, number]> = [
    [buildClean(format, tl), shot("clean").start, shot("clean").end],
    [buildKeys(format, tl), shot("keys").start, shot("keys").end],
    [buildPrepare(format, tl), shot("prepare").start, shot("prepare").end],
    [buildExport(format, tl), shot("export").start, shot("export").end],
    [buildEnd(format, tl), shot("end").start, shot("end").end],
  ];
  for (const [el, from, to] of shots) {
    world.append(el);
    showBetween(tl, el, [[from, to]]);
  }
  stage.append(buildCaptions(format, tl), buildFlash(tl));
  return { sceneHost, backdropHost, world };
}
