import type { gsap } from "gsap";
import markUrl from "../../desktop-electron/build/icon-source/mark-32.svg?url";
import { APP_PREVIEW, CLEAN_ROWS, keyColor, mixesInKey, SET } from "./content";
import type { FormatId } from "./formats";
import { at, BEAT, CAPTIONS, shot } from "./timing";

type Timeline = gsap.core.Timeline;

/**
 * The app shots are stand-ins drawn in the app's own pixel style, marked "Preview", until the
 * redesigned pages (Phase 14 and 15) can be captured from the real app (SITE-04's capture script).
 * Each sits in its own CSS 3D space, centered in the frame: the camera settles onto it at an angle and
 * then drifts slowly round to near frontal. Shots change on a hard cut on the downbeat.
 */

/** Where each cut's picture is centered (the middle of the space above the captions). */
const CENTER = { wide: 455, tall: 820 } as const;

/** A shot's 3D space: perspective on the outside, a rig the camera moves inside. */
function space(format: FormatId, cls: string, perspective = 1800): { el: HTMLElement; rig: HTMLElement } {
  const origin = `50% ${CENTER[format]}px`;
  const el = h(
    `<div class="layer ${cls}"><div class="space" style="perspective:${perspective}px;perspective-origin:${origin}"><div class="rig" style="transform-origin:${origin}"></div></div></div>`,
  );
  return { el, rig: el.querySelector(".rig")! };
}

/**
 * The one camera move every app shot uses: arrive from a little way back at an angle, settle in the first
 * beat and a half, then drift slowly through the rest of the shot. No exit move: the cut does that.
 */
function settle(tl: Timeline, rig: Element, start: number, end: number, ry: number, rx = 8): void {
  tl.fromTo(rig, { z: -700, rotationY: ry, rotationX: rx }, { z: 0, rotationY: ry * 0.25, rotationX: rx * 0.4, duration: BEAT * 1.5, ease: "power3.out" }, start);
  tl.to(rig, { z: 110, rotationY: -ry * 0.3, rotationX: rx * 0.2, duration: end - start - BEAT * 1.5, ease: "sine.inOut" }, start + BEAT * 1.5);
}

const h = (html: string): HTMLElement => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const POP = { scale: 1.4, opacity: 0 };
const IN = { scale: 1, opacity: 1, duration: BEAT / 2, ease: "steps(3)" };

/** Where the window and the captions sit in each cut: centered, inside a 5% safe area. */
const FRAME = {
  wide: { window: { width: 1560, height: 770 }, caption: 905 },
  tall: { window: { width: 960, height: 1100 }, caption: 1470 },
} as const;

function windowShell(format: FormatId, active: string, page: string): HTMLElement {
  const w = FRAME[format].window;
  const left = (format === "wide" ? 1920 : 1080) / 2 - w.width / 2;
  const top = CENTER[format] - w.height / 2;
  const nav = ["Library", "Clean", "Keys", "Discover", "Prepare"]
    .map((n) => `<div class="${n === active ? "is-active" : ""}">${n}</div>`)
    .join("");
  return h(`
    <div class="window px-panel" style="left:${left}px;top:${top}px;width:${w.width}px;height:${w.height}px">
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
  const { el, rig } = space(format, "shot-clean");
  rig.append(windowShell(format, "Clean", page));

  const { start, end } = shot("clean");
  const match = el.querySelector(".px-button.match")!;
  const apply = el.querySelector(".px-button.apply")!;
  const bar = el.querySelector(".px-progress > i")!;
  const rowEls = [...el.querySelectorAll<HTMLElement>(".row:not(.head)")];
  const n = rowEls.length;
  const accepted = CLEAN_ROWS.filter((r) => r.status === "accepted").length;
  const applied = CLEAN_ROWS.filter((r) => r.bpm[1] !== undefined || r.genre[1] !== undefined).length;

  settle(tl, rig, start, end, -24);
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
    [applyAt + BEAT / 2, `Applied to ${applied} tracks`],
  ]);

  const oldOf = (cells: Element[]): Element[] => cells.map((c) => c.querySelector(".old")).filter((o): o is Element => o !== null);
  rowEls.forEach((row, i) => {
    const t = matchedAt(i);
    const keyCell = [...row.querySelectorAll(".c-key")].filter((c) => c.querySelector(".new"));
    tl.to(oldOf(keyCell), { opacity: 0, duration: BEAT / 4, ease: "steps(2)" }, t);
    tl.fromTo(row.querySelectorAll(".c-key .new, .status .new"), { ...POP }, { ...IN }, t);
    if (row.classList.contains("is-bad")) tl.to(row, { backgroundColor: "rgba(0,0,0,0)", duration: BEAT / 2, ease: "steps(2)" }, t);
  });
  // Apply from the accepted matches: tempo and genre, row by row
  tl.from(apply, { scale: 0, opacity: 0, duration: BEAT / 2, ease: "steps(3)" }, at(4, 2));
  // GSAP owns this button's transform (it pops in), so the press moves it through GSAP as well
  tl.set(apply, { x: 4, y: 4, attr: { "data-pressed": "1" } }, applyAt);
  tl.set(apply, { x: 0, y: 0, attr: { "data-pressed": "0" } }, applyAt + BEAT / 2);
  rowEls.forEach((row, i) => {
    const t = applyAt + BEAT / 2 + (i * BEAT) / 6;
    const cells = [...row.querySelectorAll(".apply")].filter((c) => c.querySelector(".new"));
    if (cells.length === 0) return;
    tl.to(oldOf(cells), { opacity: 0, duration: BEAT / 4, ease: "steps(2)" }, t);
    tl.fromTo(cells.map((c) => c.querySelector(".new")!), { ...POP }, { ...IN }, t);
  });
  return el;
}

// ---- Keys: the wheel as a floor, the 24 keys standing on it ----

function buildKeys(format: FormatId, tl: Timeline): HTMLElement {
  const wide = format === "wide";
  const mark = wide ? 640 : 480; // whole multiples of the 32-pixel mark
  const rA = mark * 0.64;
  const rB = rA + 100;
  const { el, rig } = space(format, "shot-keys", 1600);
  const tiles = Array.from({ length: 24 }, (_, i) => {
    const n = (i % 12) + 1;
    const ring = i < 12 ? "B" : "A";
    const r = ring === "B" ? rB : rA;
    const a = (n / 12) * Math.PI * 2 - Math.PI / 2;
    return `<span class="tile" data-key="${n}${ring}" style="left:${Math.cos(a) * r}px;top:${Math.sin(a) * r}px;background:${keyColor(`${n}${ring}`)}">${n}${ring}</span>`;
  }).join("");
  if (APP_PREVIEW) el.append(h(`<span class="px-badge preview corner">Preview</span>`));
  rig.innerHTML = `<div class="disc" style="top:${CENTER[format] - (wide ? 40 : 60)}px"><div class="spin"><img src="${markUrl}" alt="" style="width:${mark}px;height:${mark}px;margin:${-mark / 2}px 0 0 ${-mark / 2}px" />${tiles}</div></div>`;
  // two transforms: the outer one tips the wheel back into a floor, the inner one turns it in its own plane
  const disc = rig.querySelector(".disc")!;
  const spin = rig.querySelector(".spin")!;
  const { start, end } = shot("keys");
  // the disc tips back into a floor and turns slowly under the camera
  tl.fromTo(disc, { rotationX: 15, scale: 0.8 }, { rotationX: 48, scale: 1, duration: BEAT * 1.5, ease: "power3.out" }, start);
  tl.fromTo(spin, { rotationZ: -50 }, { rotationZ: -12, duration: BEAT * 1.5, ease: "power3.out" }, start);
  tl.to(spin, { rotationZ: 12, duration: end - start - BEAT * 1.5, ease: "sine.inOut" }, start + BEAT * 1.5);
  const tileEls = [...el.querySelectorAll<HTMLElement>(".tile")];
  // all 24 stand up in a sweep round the wheel, then the keys that mix with 8A rise above the rest
  const order = [...tileEls].sort((a, b) => Number.parseInt(a.dataset["key"]!, 10) - Number.parseInt(b.dataset["key"]!, 10));
  order.forEach((tile, i) => tl.fromTo(tile, { z: 0, opacity: 0.25 }, { z: 30, opacity: 1, duration: BEAT / 4, ease: "steps(2)" }, start + BEAT + (i * BEAT) / 8));
  const lift = at(7, 0);
  for (const tile of tileEls) {
    const key = tile.dataset["key"]!;
    if (key === "8A") tl.to(tile, { z: 110, scale: 1.3, duration: BEAT / 2, ease: "power2.out" }, lift);
    else if (mixesInKey("8A", key)) tl.to(tile, { z: 80, scale: 1.15, duration: BEAT / 2, ease: "power2.out" }, lift + BEAT / 2);
    // from an explicit start: the rise sweep's last tiles are still landing at `lift`
    else tl.fromTo(tile, { opacity: 1 }, { opacity: 0.3, duration: BEAT / 2, ease: "power1.out", immediateRender: false }, lift + BEAT / 4);
  }
  return el;
}

// ---- Prepare: the running order, every step in key ----

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
  // the running order, each step checked: the slots drop onto the page one per beat
  const slots = SET.map(
    (s, i) => `
      ${i > 0 ? `<div class="link"><i></i>${SET[i - 1]!.key} to ${s.key}: mixes in key</div>` : ""}
      <div class="slot"><span class="n">${i + 1}</span><span class="t">${esc(s.title)}</span><span class="bpm">${s.bpm} BPM</span>${keyBadge(s.key)}</div>`,
  ).join("");
  const page = `
    <div class="page__head"><h2>Prepare</h2><p>Plan a set</p><span class="px-badge">Friday warm-up</span></div>
    <div class="wave">${waveSvg()}<div class="played"></div><div class="head"></div></div>
    <div class="order">${slots}</div>`;
  const { el, rig } = space(format, "shot-prepare");
  rig.append(windowShell(format, "Prepare", page));

  const { start, end } = shot("prepare");
  settle(tl, rig, start, end, 22);
  el.querySelectorAll(".slot").forEach((slot, i) => {
    tl.fromTo(slot, { z: 220, opacity: 0 }, { z: 0, opacity: 1, duration: BEAT * 0.75, ease: "power3.out" }, start + BEAT * (0.5 + i));
  });
  el.querySelectorAll(".link").forEach((link, i) => {
    tl.fromTo(link, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: BEAT / 2, ease: "power2.out" }, start + BEAT * (1.25 + i));
  });
  const beats = Math.round((end - start) / BEAT);
  tl.fromTo(el.querySelector(".wave .head"), { left: "6%" }, { left: "70%", duration: end - start, ease: `steps(${beats * 2})` }, start);
  tl.fromTo(el.querySelector(".wave .played"), { width: "6%" }, { width: "70%", duration: end - start, ease: `steps(${beats * 2})` }, start);
  return el;
}

// ---- Export: back to Rekordbox, the file lifting out of the dialog ----

function buildExport(format: FormatId, tl: Timeline): HTMLElement {
  const wide = format === "wide";
  const width = wide ? 1100 : 960;
  const top = CENTER[format] - (wide ? 230 : 300);
  const { el, rig } = space(format, "shot-export", 1600);
  rig.innerHTML = `
      <div class="dialog px-panel" style="width:${width}px;margin-left:${-width / 2}px;top:${top}px">
        <h3>Export to Rekordbox ${APP_PREVIEW ? `<span class="px-badge preview">Preview</span>` : ""}</h3>
        <div class="inner">
          <div class="field">CuePoint library.xml</div>
          <div class="preview"><b>Preview</b><span>Your own key, BPM and genre go with every track.</span></div>
          <div class="px-progress"><i></i></div>
          <div class="actions"><span class="px-button">Export ${CLEAN_ROWS.length} tracks</span></div>
        </div>
      </div>
      <div class="file" style="top:${CENTER[format]}px"><b>XML</b></div>`;
  // level and centered, between the dialog and the caption
  el.append(h(`<div class="toast-row" style="top:${wide ? 790 : 1250}px"><div class="toast">Ready for Rekordbox</div></div>`));
  const { start, end } = shot("export");
  settle(tl, rig, start, end, 20);
  const button = el.querySelector(".px-button")!;
  tl.set(button, { attr: { "data-pressed": "1" } }, at(10, 1.5));
  tl.set(button, { attr: { "data-pressed": "0" } }, at(10, 2));
  tl.to(el.querySelector(".px-progress > i"), { width: "100%", duration: BEAT * 2, ease: "steps(10)" }, at(10, 2));
  // the file lifts out of the dialog to the side (above it on the phone) and floats there, turning
  const file = el.querySelector(".file")!;
  const to = wide ? { x: 660, y: 0 } : { x: 0, y: -420 };
  const from = wide ? { x: 520, y: 0 } : { x: 0, y: -240 };
  tl.fromTo(file, { ...from, z: -40, scale: 0.4, opacity: 0, rotationY: -40 }, { ...to, z: 60, scale: 1, opacity: 1, rotationY: 18, duration: BEAT * 1.5, ease: "power3.out" }, at(11, 0));
  tl.to(file, { y: to.y - 18, rotationY: -12, duration: end - at(11, 1.5), ease: "sine.inOut" }, at(11, 1.5));
  tl.fromTo(el.querySelector(".toast"), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: BEAT / 2, ease: "power2.out" }, at(11, 1));
  return el;
}

// ---- The end card, over the site's 3D wheel turning behind it ----

function buildEnd(format: FormatId, tl: Timeline): HTMLElement {
  const wide = format === "wide";
  const markPx = wide ? 192 : 224;
  const letters = [..."CuePoint"].map((c) => `<span>${c}</span>`).join("");
  const el = h(`
    <div class="layer end-card">
      <div class="end-dim"></div>
      <div class="end-panel">
        <img class="end-mark" src="${markUrl}" alt="" style="width:${markPx}px;height:${markPx}px" />
        <h1>${letters}</h1>
        <p>Your Rekordbox library, cleaned up and ready for the booth.</p>
        <span class="px-button url">usecuepoint.com</span>
      </div>
    </div>`);
  const { start } = shot("end");
  // the wheel dims behind the words from the cut on
  tl.fromTo(el.querySelector(".end-dim"), { opacity: 0.4 }, { opacity: 1, duration: BEAT, ease: "power1.out" }, start);
  tl.fromTo(el.querySelector(".end-mark"), { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: BEAT, ease: "power3.out" }, start + BEAT / 2);
  el.querySelectorAll("h1 span").forEach((s, i) => {
    tl.fromTo(s, { rotationX: -90, opacity: 0 }, { rotationX: 0, opacity: 1, duration: BEAT * 0.75, ease: "power3.out" }, at(12, 3) + (i * BEAT) / 6);
  });
  tl.fromTo(el.querySelector("p"), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: BEAT, ease: "power2.out" }, at(14, 0));
  tl.fromTo(el.querySelector(".url"), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: BEAT, ease: "power2.out" }, at(14, 2));
  return el;
}

// ---- captions ----

/** Level, in one fixed place in the lower third, fading in and out. */
function buildCaptions(format: FormatId, tl: Timeline): HTMLElement {
  const el = h(`<div class="layer captions"></div>`);
  for (const c of CAPTIONS) {
    const cap = h(`<div class="caption" style="top:${FRAME[format].caption}px">${esc(c.text)}</div>`);
    el.append(cap);
    tl.fromTo(cap, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: BEAT / 2, ease: "power2.out" }, c.from);
    tl.to(cap, { opacity: 0, duration: BEAT / 4, ease: "power1.in" }, c.to - BEAT / 4);
  }
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
}

/** Builds every layer onto the stage and its tweens onto the timeline. */
export function buildShots(stage: HTMLElement, format: FormatId, tl: Timeline): Hosts {
  const sceneHost = h(`<div class="layer scene-host"></div>`);
  const backdropHost = h(`<div class="layer backdrop-host"></div>`);
  stage.append(sceneHost, backdropHost);
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
    stage.append(el);
    showBetween(tl, el, [[from, to]]);
  }
  stage.append(buildCaptions(format, tl));
  return { sceneHost, backdropHost };
}
