import type { gsap } from "gsap";
import markUrl from "../../desktop-electron/build/icon-source/mark-32.svg?url";
import { APP_PREVIEW, CLEAN_ROWS, HUES, keyColor, RELEASES, SET } from "./content";
import type { FormatId } from "./formats";
import { at, BEAT, CAPTIONS, shot } from "./timing";

type Timeline = gsap.core.Timeline;

/**
 * The app shots are stand-ins drawn in the app's own pixel style, marked "Preview", until the
 * redesigned pages (Phase 14 and 15) can be captured from the real app (SITE-04's capture script).
 *
 * They all live in one CSS 3D world, each panel at its own place, and a camera flies between them:
 * fast on the downbeat, then a slow drift while the panel does its thing. The viewer is inside the app.
 */

/** Where the picture is centered: the camera's eye, in the space above the captions. */
const CENTER = { wide: 455, tall: 770 } as const;

/** A place in the world: where a panel sits and which way it faces (degrees). */
interface Place {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx: number;
  readonly ry: number;
}

type PanelId = "clean" | "keys" | "discover" | "prepare" | "waveforms" | "export";

/** The order the camera visits the panels: the shots, in time. */
const TOUR: readonly PanelId[] = ["clean", "keys", "discover", "prepare", "waveforms", "export"];

/**
 * The world's layout, for the wide cut: a loose spiral going away from the camera, so every flight has
 * its own direction and the panels ahead show in the distance behind the one in front.
 */
const LAYOUT: Readonly<Record<PanelId, Place>> = {
  clean: { x: 0, y: 0, z: 0, rx: 0, ry: 0 },
  keys: { x: 3600, y: 200, z: -2200, rx: 0, ry: -42 },
  discover: { x: -3400, y: -300, z: -4200, rx: -6, ry: 40 },
  prepare: { x: 700, y: 1500, z: -6200, rx: -22, ry: -14 },
  waveforms: { x: -1300, y: 100, z: -8200, rx: 24, ry: 32 },
  export: { x: 3300, y: 100, z: -10200, rx: 8, ry: -36 },
};

/** How close the camera settles on each panel, so each fills about the same share of the frame. */
const SETTLE: Readonly<Record<PanelId, number>> = { clean: 0, keys: 240, discover: 90, prepare: 90, waveforms: 90, export: 300 };

/** The phone cut's world is smaller, like its panels. */
const WORLD_SCALE = { wide: 1, tall: 0.6 } as const;

const placeOf = (format: FormatId, id: PanelId): Place => {
  const p = LAYOUT[id];
  const k = WORLD_SCALE[format];
  return { x: p.x * k, y: p.y * k, z: p.z * k, rx: p.rx, ry: p.ry };
};

/**
 * The camera, as four nested elements: dolly (an offset in the camera's own space: closer, aside, up), then
 * turn, tilt and move, the exact inverse of a panel's transform, so a panel seen with no offset is dead
 * level and centered, and a push or a slide moves the camera, never the panel.
 */
interface Camera {
  readonly dolly: HTMLElement;
  readonly turn: HTMLElement;
  readonly tilt: HTMLElement;
  readonly move: HTMLElement;
}

/** How a panel should appear from the camera: offsets from dead-center and frontal (z > 0 is closer). */
type View = Partial<Place>;

/** The tween values that put the camera at `place`, seen with `view`. */
function camera(format: FormatId, place: Place, view: View = {}): { dolly: gsap.TweenVars; turn: gsap.TweenVars; tilt: gsap.TweenVars; move: gsap.TweenVars } {
  // on the phone the whole picture sits a little left, clear of the buttons down the right edge
  const shift = format === "tall" ? -20 : 0;
  return {
    dolly: { x: (view.x ?? 0) + shift, y: view.y ?? 0, z: view.z ?? 0 },
    turn: { rotationY: -place.ry + (view.ry ?? 0) },
    tilt: { rotationX: -place.rx + (view.rx ?? 0) },
    move: { x: -place.x, y: -place.y, z: -place.z },
  };
}

/** Flies the camera to `place` (seen with `view`) over `duration` seconds, starting at `t`. */
function flyTo(tl: Timeline, cam: Camera, format: FormatId, place: Place, view: View, t: number, duration: number, ease: string): void {
  const c = camera(format, place, view);
  tl.to(cam.dolly, { ...c.dolly, duration, ease }, t);
  tl.to(cam.turn, { ...c.turn, duration, ease }, t);
  tl.to(cam.tilt, { ...c.tilt, duration, ease }, t);
  tl.to(cam.move, { ...c.move, duration, ease }, t);
}

/** The world: perspective on the outside, the camera's three elements inside, the panels in the innermost. */
function createWorld(format: FormatId): { el: HTMLElement; cam: Camera; body: HTMLElement } {
  const origin = `50% ${CENTER[format]}px`;
  const el = h(`
    <div class="layer world" style="perspective-origin:${origin}">
      <div class="cam dolly">
        <div class="cam turn" style="transform-origin:${origin}">
          <div class="cam tilt" style="transform-origin:${origin}">
            <div class="cam move"></div>
          </div>
        </div>
      </div>
    </div>`);
  const [dolly, turn, tilt, move] = [...el.querySelectorAll<HTMLElement>(".cam")] as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
  return { el, cam: { dolly, turn, tilt, move }, body: move };
}

/** A panel at its place in the world; its content is centered on the panel's origin. */
function panel(format: FormatId, id: PanelId): HTMLElement {
  const p = placeOf(format, id);
  const el = h(`<div class="panel panel-${id}" style="top:${CENTER[format]}px;transform:translate3d(${p.x}px,${p.y}px,${p.z}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg)"></div>`);
  return el;
}

const h = (html: string): HTMLElement => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const POP = { scale: 1.4, opacity: 0 };
const IN = { scale: 1, opacity: 1, duration: BEAT / 2, ease: "steps(3)" };

/** How big the windows are and where the captions sit in each cut: inside a 5% safe area. */
const FRAME = {
  wide: { window: { width: 1560, height: 770 }, caption: 905 },
  // inside Reels' and TikTok's safe zone (y 220 to 1500, clear of the buttons on the right)
  tall: { window: { width: 920, height: 1000 }, caption: 1310 },
} as const;

function windowShell(format: FormatId, active: string, page: string): HTMLElement {
  const w = FRAME[format].window;
  // centered on its panel's origin
  const left = -w.width / 2;
  const top = -w.height / 2;
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
        r.status === "accepted" ? '<i class="tick">✓</i>Accepted' : "Needs review"
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
  const el = panel(format, "clean");
  el.append(windowShell(format, "Clean", page));

  const { start, end } = shot("clean");
  const match = el.querySelector(".px-button.match")!;
  const apply = el.querySelector(".px-button.apply")!;
  const bar = el.querySelector(".px-progress > i")!;
  const rowEls = [...el.querySelectorAll<HTMLElement>(".row:not(.head)")];
  const n = rowEls.length;
  const accepted = CLEAN_ROWS.filter((r) => r.status === "accepted").length;
  const applied = CLEAN_ROWS.filter((r) => r.bpm[1] !== undefined || r.genre[1] !== undefined).length;

  const beat = (b: number): number => start + b * BEAT;
  void end;
  tl.set(match, { attr: { "data-pressed": "1" } }, beat(0.5));
  tl.set(match, { attr: { "data-pressed": "0" } }, beat(0.75));
  const first = beat(0.75);
  const step = BEAT / 4;
  tl.to(bar, { width: "100%", duration: step * n, ease: `steps(${n * 4})` }, first);
  const matchedAt = (i: number): number => first + step * (i + 1) - step / 2;
  const applyAt = beat(3);
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
    const tick = row.querySelector(".tick");
    if (tick) tl.fromTo(tick, { scale: 2.2, rotation: -20 }, { scale: 1, rotation: 0, duration: BEAT * 0.4, ease: "back.out(2.5)" }, t + BEAT / 8);
    if (row.classList.contains("is-bad")) tl.to(row, { backgroundColor: "rgba(0,0,0,0)", duration: BEAT / 2, ease: "steps(2)" }, t);
  });
  // Apply from the accepted matches: tempo and genre, row by row
  tl.from(apply, { scale: 0, opacity: 0, duration: BEAT / 2, ease: "steps(3)" }, beat(2.5));
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

/** The Keys shot's count line, flat on the stage like a caption (set by buildKeys). */
let keysHud: HTMLElement | undefined;

function buildKeys(format: FormatId, tl: Timeline): HTMLElement {
  const wide = format === "wide";
  const mark = wide ? 608 : 448; // whole multiples of the 32-pixel mark
  const rA = mark * 0.64;
  const rB = rA + 100;
  const el = panel(format, "keys");
  const tiles = Array.from({ length: 24 }, (_, i) => {
    const n = (i % 12) + 1;
    const ring = i < 12 ? "B" : "A";
    const r = ring === "B" ? rB : rA;
    const a = (n / 12) * Math.PI * 2 - Math.PI / 2;
    return `<span class="tile" data-key="${n}${ring}" style="left:${Math.cos(a) * r}px;top:${Math.sin(a) * r}px;background:${keyColor(`${n}${ring}`)}">${n}${ring}</span>`;
  }).join("");
  const w = FRAME[format].window;
  el.append(h(`<div class="panel-title px-panel" style="top:${-w.height / 2 + 10}px">Keys${APP_PREVIEW ? ` <span class="px-badge preview">Preview</span>` : ""}</div>`));
  el.innerHTML += `<div class="disc" style="top:${wide ? 30 : 10}px"><div class="spin"><img src="${markUrl}" alt="" style="width:${mark}px;height:${mark}px;margin:${-mark / 2}px 0 0 ${-mark / 2}px" />${tiles}</div></div>`;
  // two transforms: the outer one tips the wheel back into a floor, the inner one turns it in its own plane
  const disc = el.querySelector(".disc")!;
  const spin = el.querySelector(".spin")!;
  const { start, end } = shot("keys");
  // the disc tips back into a floor and turns slowly under the camera
  tl.fromTo(disc, { rotationX: 15, scale: 0.8 }, { rotationX: 48, scale: 1, duration: BEAT, ease: "power3.out" }, start);
  tl.fromTo(spin, { rotationZ: -50 }, { rotationZ: -12, duration: BEAT, ease: "power3.out" }, start);
  tl.to(spin, { rotationZ: 12, duration: end - start - BEAT, ease: "sine.inOut" }, start + BEAT);
  const tileEls = [...el.querySelectorAll<HTMLElement>(".tile")];
  // all 24 stand up in a sweep round the wheel, then one key is picked (the Library's key filter):
  // 8A rises and the rest dim
  const order = [...tileEls].sort((a, b) => Number.parseInt(a.dataset["key"]!, 10) - Number.parseInt(b.dataset["key"]!, 10));
  order.forEach((tile, i) => tl.fromTo(tile, { z: 0, opacity: 0.25 }, { z: 30, opacity: 1, duration: BEAT / 4, ease: "steps(2)" }, start + BEAT / 4 + (i * BEAT) / 24));
  const lift = start + BEAT * 1.5;
  // 8A is picked; the keys that mix with it (same number, or one step on the same letter) come up with it
  const mixes = new Set(["8A", "8B", "7A", "9A"]);
  for (const tile of tileEls) {
    const key = tile.dataset["key"]!;
    if (key === "8A") tl.to(tile, { z: 120, scale: 1.4, duration: BEAT / 2, ease: "power2.out" }, lift);
    else if (mixes.has(key)) tl.to(tile, { z: 70, scale: 1.15, duration: BEAT / 2, ease: "power2.out" }, lift + BEAT / 8);
    // from an explicit start: the rise sweep's last tiles are still landing at `lift`
    else tl.fromTo(tile, { opacity: 1, z: 30 }, { opacity: 0.4, z: 0, duration: BEAT / 2, ease: "power1.out", immediateRender: false }, lift + BEAT / 4);
  }
  const count = h(`<div class="keys-count px-panel"><b>${mixes.size}</b> mix in key with <span class="key" style="background:${keyColor("8A")}">8A</span></div>`);
  keysHud = count;
  tl.fromTo(count, { opacity: 0, y: 20, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: BEAT / 2, ease: "power3.out" }, lift + BEAT / 2);
  tl.to(count, { opacity: 0, y: -16, duration: BEAT / 4, ease: "power2.in" }, end - LEAD - BEAT / 4);
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
  const el = panel(format, "prepare");
  el.append(windowShell(format, "Prepare", page));

  const { start, end } = shot("prepare");
  el.querySelectorAll(".slot").forEach((slot, i) => {
    tl.fromTo(slot, { z: 220, opacity: 0 }, { z: 24, opacity: 1, duration: BEAT * 0.5, ease: "power3.out" }, start + BEAT * (0.1 + i / 3));
  });
  el.querySelectorAll(".link").forEach((link, i) => {
    tl.fromTo(link, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: BEAT / 2, ease: "power2.out" }, start + BEAT * (0.5 + i / 3));
  });
  // then the set plays through: each track in turn steps forward and lights up, half a beat apiece
  const slotEls = [...el.querySelectorAll<HTMLElement>(".slot")];
  slotEls.forEach((slot, i) => {
    const on = start + BEAT * (2 + i / 2);
    tl.set(slot, { attr: { "data-playing": "1" } }, on);
    tl.to(slot, { z: 70, duration: BEAT / 4, ease: "power2.out" }, on);
    if (i < slotEls.length - 1) {
      tl.set(slot, { attr: { "data-playing": "0" } }, on + BEAT / 2);
      tl.to(slot, { z: 24, duration: BEAT / 4, ease: "power2.inOut" }, on + BEAT / 2);
    }
  });
  const beats = Math.round((end - start) / BEAT);
  tl.fromTo(el.querySelector(".wave .head"), { left: "6%" }, { left: "70%", duration: end - start, ease: `steps(${beats * 2})` }, start);
  tl.fromTo(el.querySelector(".wave .played"), { width: "6%" }, { width: "70%", duration: end - start, ease: `steps(${beats * 2})` }, start);
  return el;
}

// ---- Discover: new releases from the artists you play ----

/** A release's cover: an 8 x 8 pixel pattern in two of the icon's hues, the same every render. */
/** Six pixel-art covers, one motif each, drawn on a 16 by 16 grid in two or three of the key hues. */
const COVERS: ReadonlyArray<{ bg: string; px: (x: number, y: number) => string | undefined }> = [
  // Tidal Lines: rolling wave bands
  { bg: "#10243a", px: (x, y) => (Math.round(Math.sin(x * 0.8) * 1.5 + y) % 4 === 0 ? HUES[9] : Math.round(Math.sin(x * 0.8) * 1.5 + y) % 4 === 1 ? HUES[10] : undefined) },
  // Night Swim: a moon over ripples
  { bg: "#141432", px: (x, y) => ((x - 11) ** 2 + (y - 4) ** 2 <= 6 ? HUES[2] : y >= 10 && (x + y) % 5 < 2 ? HUES[8] : undefined) },
  // Parallax: diagonal stripes and a square in front
  { bg: "#2a1a3a", px: (x, y) => (x >= 5 && x <= 10 && y >= 5 && y <= 10 ? HUES[2] : (x + y) % 6 < 2 ? HUES[7] : (x + y) % 6 === 3 ? HUES[6] : undefined) },
  // Soft Focus: concentric squares
  { bg: "#3a1a2a", px: (x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return d > 6.5 ? undefined : d > 4.5 ? HUES[5] : d > 2.5 ? HUES[4] : HUES[3]; } },
  // Lanterns: small lights in the dark
  { bg: "#101828", px: (x, y) => ((x * 7 + y * 13) % 23 < 2 ? HUES[3] : (x * 5 + y * 11) % 29 === 0 ? HUES[2] : undefined) },
  // Coastline: sky bands, a sun, and the sea
  { bg: "#1a2a3a", px: (x, y) => (y < 7 ? ((x - 4) ** 2 + (y - 3) ** 2 <= 4 ? HUES[3] : y % 3 === 0 ? HUES[4] : undefined) : y === 7 ? HUES[11] : (x + y * 2) % 5 < 2 ? HUES[9] : undefined) },
];

function coverSvg(i: number): string {
  const cover = COVERS[i % COVERS.length]!;
  let px = "";
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const fill = cover.px(x, y);
      if (fill) px += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    }
  }
  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" fill="${cover.bg}"/>${px}</svg>`;
}

function buildDiscover(format: FormatId, tl: Timeline): HTMLElement {
  const cards = RELEASES.map(
    (r, i) => `
      <div class="release">
        <div class="cover">${coverSvg(i)}</div>
        <div class="r-title">${esc(r.title)}</div>
        <div class="r-artist">${esc(r.artist)}</div>
        <span class="px-button want"></span>
      </div>`,
  ).join("");
  const page = `
    <div class="page__head"><h2>Discover</h2><p>New on Beatport from artists you play</p></div>
    <div class="releases">${cards}</div>`;
  const el = panel(format, "discover");
  el.append(windowShell(format, "Discover", page));
  const { start } = shot("discover");
  el.querySelectorAll(".release").forEach((card, i) => {
    tl.fromTo(card, { z: 260, opacity: 0 }, { z: 36, opacity: 1, duration: BEAT / 3, ease: "power3.out" }, start + BEAT * 0.1 + (BEAT * i) / 6);
  });
  // two of them go on the wantlist, a beat apart
  const wants = [...el.querySelectorAll<HTMLElement>(".want")];
  const picks = new Map([[0, start + BEAT * 2.25], [4, start + BEAT * 3.25]]);
  wants.forEach((button, i) => {
    const t = picks.get(i);
    textTrack(button, tl, t === undefined ? [[0, "+ Wantlist"]] : [[0, "+ Wantlist"], [t + BEAT / 4, "On wantlist"]]);
    if (t === undefined) return;
    tl.set(button, { attr: { "data-pressed": "1" } }, t);
    tl.set(button, { attr: { "data-pressed": "0", "data-on": "1" } }, t + BEAT / 4);
  });
  return el;
}

// ---- Waveforms: a track's waveform with its cues and beat grid ----

/** Where the track's cues sit, as a share of its length, and their colors (the icon's hues). */
const CUES = [
  { at: 0.06, color: HUES[0]! },
  { at: 0.28, color: HUES[9]! },
  { at: 0.5, color: HUES[4]! },
  { at: 0.62, color: HUES[2]! },
  { at: 0.86, color: HUES[6]! },
] as const;

function buildWaveforms(format: FormatId, tl: Timeline): HTMLElement {
  const ticks = Array.from({ length: 21 }, (_, i) => `<i class="${i % 4 === 0 ? "down" : ""}" style="left:${(i / 20) * 100}%"></i>`).join("");
  const cues = CUES.map((c, i) => `<b class="cue" style="left:${c.at * 100}%;background:${c.color}">${String.fromCharCode(65 + i)}</b>`).join("");
  const page = `
    <div class="page__head"><h2>Night Drive</h2><p>Lumen Coast</p>${keyBadge("8A")}<span class="px-badge">122 BPM</span></div>
    <div class="player">
      <div class="cues">${cues}</div>
      <div class="wave big">${waveSvg()}<div class="grid">${ticks}</div><div class="played"></div><div class="head"></div><i class="ring" style="left:${CUES[1]!.at * 100}%"></i></div>
    </div>`;
  const el = panel(format, "waveforms");
  el.append(windowShell(format, "Library", page));
  const { start, end } = shot("waveforms");
  // the waveform draws on from left to right, then the cues drop onto it
  tl.fromTo(el.querySelector(".wave svg"), { clipPath: "inset(0 60% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: BEAT, ease: "steps(12)" }, start);
  tl.fromTo(el.querySelector(".wave .grid"), { opacity: 0 }, { opacity: 1, duration: BEAT / 2, ease: "power1.out" }, start + BEAT / 2);
  const cueEls = [...el.querySelectorAll<HTMLElement>(".cue")];
  cueEls.forEach((cue, i) => {
    tl.fromTo(cue, { y: -60, opacity: 0 }, { y: 0, opacity: 1, duration: BEAT / 2, ease: "power3.out" }, start + BEAT * (0.25 + i / 4));
  });
  // the playhead runs from beat 1 to the end of the bar; it reaches cue B exactly on beat 3, and the cue flashes
  const run = { from: 4, to: 40 };
  const beats = Math.round((end - start) / BEAT);
  tl.fromTo(el.querySelector(".wave .head"), { left: `${run.from}%` }, { left: `${run.to}%`, duration: end - start - BEAT, ease: "none" }, start + BEAT);
  tl.fromTo(el.querySelector(".wave .played"), { width: `${run.from}%` }, { width: `${run.to}%`, duration: end - start - BEAT, ease: "none" }, start + BEAT);
  const hit = start + BEAT * (1 + ((beats - 1) * (CUES[1]!.at * 100 - run.from)) / (run.to - run.from));
  const cueB = cueEls[1]!;
  tl.to(cueB, { scale: 1.6, duration: BEAT / 4, ease: "power2.out" }, hit);
  tl.to(cueB, { scale: 1, duration: BEAT / 2, ease: "power2.inOut" }, hit + BEAT / 4);
  tl.fromTo(el.querySelector(".wave .ring"), { scale: 0.3, opacity: 1 }, { scale: 3, opacity: 0, duration: BEAT * 0.75, ease: "power2.out" }, hit);
  return el;
}

// ---- Export: back to Rekordbox, the file lifting out of the dialog ----

function buildExport(format: FormatId, tl: Timeline): HTMLElement {
  const wide = format === "wide";
  const width = wide ? 1180 : 820;
  // the dialog is centered on the panel's origin (its height is about 420 wide, 500 tall)
  const top = wide ? -210 : -250;
  const el = panel(format, "export");
  el.innerHTML = `
      <div class="dialog px-panel" style="width:${width}px;margin-left:${-width / 2}px;top:${top}px">
        <h3>Export to Rekordbox ${APP_PREVIEW ? `<span class="px-badge preview">Preview</span>` : ""}</h3>
        <div class="inner">
          <div class="field">CuePoint library.xml</div>
          <div class="preview"><b>Preview</b><span>Your own key, BPM and genre go with every track.</span></div>
          <div class="px-progress"><i></i></div>
          <div class="actions"><span class="toast">Ready for Rekordbox</span><span class="px-button">Export ${CLEAN_ROWS.length} tracks</span></div>
        </div>
      </div>
      <div class="file"><b>XML</b><small>${CLEAN_ROWS.length} tracks<br>keys, BPM, genre</small></div>`;
  const { start, end } = shot("export");
  const button = el.querySelector(".px-button")!;
  const beat = (b: number): number => start + b * BEAT;
  tl.set(button, { attr: { "data-pressed": "1" } }, beat(0.75));
  tl.set(button, { attr: { "data-pressed": "0" } }, beat(1));
  tl.to(el.querySelector(".px-progress > i"), { width: "100%", duration: BEAT, ease: "steps(8)" }, beat(1));
  // the file rises out of the Export button and floats beside the dialog (above it on the phone)
  const file = el.querySelector(".file")!;
  const from = wide ? { x: width / 2 - 160, y: 150 } : { x: width / 2 - 140, y: 190 };
  const to = wide ? { x: width / 2 - 110, y: -215 } : { x: 0, y: -430 };
  tl.fromTo(file, { ...from, z: 40, scale: 0.3, opacity: 0, rotationY: -30 }, { ...to, z: 60, scale: 0.85, opacity: 1, rotationY: 14, duration: BEAT * 1.25, ease: "power3.out" }, beat(2));
  tl.to(file, { y: to.y - 14, rotationY: -8, duration: end - beat(3.25), ease: "sine.inOut" }, beat(3.25));
  tl.fromTo(el.querySelector(".toast"), { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: BEAT / 2, ease: "power2.out" }, beat(2.25));
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
        <p class="free">Free and open source.</p>
        <span class="px-button url">usecuepoint.com</span>
      </div>
    </div>`);
  const { start } = shot("end");
  // the wheel dims behind the words from the cut on
  tl.fromTo(el.querySelector(".end-dim"), { opacity: 0.85 }, { opacity: 0.93, duration: BEAT, ease: "power1.out" }, start);
  tl.fromTo(el.querySelector(".end-mark"), { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: BEAT, ease: "power3.out" }, start);
  el.querySelectorAll("h1 span").forEach((s, i) => {
    tl.fromTo(s, { rotationX: -90, opacity: 0 }, { rotationX: 0, opacity: 1, duration: BEAT * 0.75, ease: "power3.out" }, start + BEAT * 0.5 + (i * BEAT) / 6);
  });
  // a slow push for the whole hold, so the last frames still move
  tl.fromTo(el.querySelector(".end-panel"), { scale: 0.97 }, { scale: 1.03, duration: shot("end").end - start, ease: "none" }, start);
  tl.fromTo(el.querySelector("p"), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: BEAT, ease: "power2.out" }, start + BEAT * 2);
  tl.fromTo(el.querySelector(".free"), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: BEAT, ease: "power2.out" }, start + BEAT * 2.75);
  tl.fromTo(el.querySelector(".url"), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: BEAT, ease: "power2.out" }, start + BEAT * 3.5);
  return el;
}

// ---- captions ----

/** Level, in one fixed place in the lower third, fading in and out. */
function buildCaptions(format: FormatId, tl: Timeline): HTMLElement {
  const el = h(`<div class="layer captions"></div>`);
  for (const c of CAPTIONS) {
    const cap = h(`<div class="caption" style="top:${FRAME[format].caption}px"><span>${esc(c.text)}</span></div>`);
    el.append(cap);
    const text = cap.firstElementChild!;
    // the box rises and settles softly while the words wipe on left to right; it leaves gliding up
    if (c.from === 0) {
      // the hook: on screen from the first frame
      cap.style.opacity = "1";
      tl.to(cap, { opacity: 0, y: -22, duration: BEAT * 0.35, ease: "power2.in" }, c.to - BEAT * 0.35);
      continue;
    }
    tl.fromTo(cap, { opacity: 0, y: 30, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: BEAT * 0.65, ease: "power3.out" }, c.from);
    tl.fromTo(text, { clipPath: "inset(-10px 100% -10px -10px)" }, { clipPath: "inset(-10px -10px -10px -10px)", duration: BEAT * 0.6, ease: "power2.inOut" }, c.from + BEAT * 0.1);
    tl.to(cap, { opacity: 0, y: -22, duration: BEAT * 0.35, ease: "power2.in" }, c.to - BEAT * 0.35);
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
}

/**
 * The camera's tour. It lands on Clean as the drop hits, pushes in on the values as Apply fills them,
 * then on every downbeat flies fast to the next panel and drifts in on it, and at the end flies on
 * through Export into the end card.
 */
const FLY = BEAT;
const LEAD = BEAT / 2;

function tour(tl: Timeline, cam: Camera, format: FormatId): void {
  // a flight takes a beat, and lands half a beat after the downbeat: the kick is the landing
  const clean = shot("clean");
  const p = (id: PanelId): Place => placeOf(format, id);
  // the arrival on the drop: from back and to the left, settling in three quarters of a beat
  // every panel settles dead level: a window that leans reads as misaligned, so the motion at rest is a
  // push in with a slide across (the window's layers sit at different depths and shift against each other)
  const wide = format === "wide";
  const k = 0;
  const c0 = camera(format, p("clean"), { z: -1800, x: -700, y: 200, ry: -30, rx: 8 });
  tl.set(cam.dolly, c0.dolly, clean.start);
  tl.set(cam.turn, c0.turn, clean.start);
  tl.set(cam.tilt, c0.tilt, clean.start);
  tl.set(cam.move, c0.move, clean.start);
  flyTo(tl, cam, format, p("clean"), { z: -130, ry: -4 * k, rx: 2 * k }, clean.start, BEAT * 0.75, "power3.out");
  flyTo(tl, cam, format, p("clean"), { z: -100 }, clean.start + BEAT * 0.75, BEAT * 2, "sine.inOut");
  // the push in on the table as Apply fills it
  const pushed: View = { z: wide ? 120 : 60, x: wide ? -60 : 0, y: wide ? -10 : -20 };
  flyTo(tl, cam, format, p("clean"), { ...pushed, ry: 3 * k, rx: 2 * k }, clean.start + BEAT * 2.75, BEAT * 1.25, "power3.inOut");
  flyTo(tl, cam, format, p("clean"), { ...pushed, z: pushed.z! + 30, ry: -2 * k }, clean.start + BEAT * 4, clean.end - LEAD - (clean.start + BEAT * 4), "sine.inOut");
  // then one panel a bar: a fast flight, arriving a little off-axis, and a drift to frontal
  const sides = [1, -1, 1, -1, 1];
  TOUR.slice(1).forEach((id, i) => {
    const { start, end } = shot(id);
    const side = sides[i]!;
    // the phone frame is narrow: every panel settles a step further back there
    const near = wide ? SETTLE[id] : id === "keys" ? 200 : SETTLE[id] - 50;
    const slide = wide ? 30 : 14;
    flyTo(tl, cam, format, p(id), { z: near - 140, x: -slide * side, ry: 8 * side * k, rx: -3 * side * k }, start - LEAD, FLY, "power3.inOut");
    // a bank through the flight, level again on landing
    tl.to(cam.tilt, { rotation: 5 * side, duration: FLY / 2, ease: "power2.out" }, start - LEAD);
    tl.to(cam.tilt, { rotation: 0, duration: FLY / 2, ease: "power2.in" }, start - LEAD + FLY / 2);
    const last = id === "export";
    const driftEnd = last ? end - BEAT : end - LEAD;
    flyTo(tl, cam, format, p(id), { z: near + 30, x: last ? 0 : slide * side, ry: last ? 0 : -2 * side * k }, start + LEAD, driftEnd - start - LEAD, "sine.inOut");
    // the way out: straight on through the last panel, into the end card
    if (last) flyTo(tl, cam, format, p(id), { z: near + 2800, y: -160 }, driftEnd, BEAT, "power3.in");
  });
}

/** Builds every layer onto the stage and its tweens onto the timeline. */
export function buildShots(stage: HTMLElement, format: FormatId, tl: Timeline): Hosts {
  const sceneHost = h(`<div class="layer scene-host"></div>`);
  const world = createWorld(format);
  stage.append(sceneHost, world.el);
  showBetween(tl, sceneHost, [
    [0, shot("opening").end],
    [shot("end").start, shot("end").end],
  ]);
  showBetween(tl, world.el, [[shot("clean").start, shot("end").start]]);
  const panels: Record<PanelId, HTMLElement> = {
    clean: buildClean(format, tl),
    keys: buildKeys(format, tl),
    discover: buildDiscover(format, tl),
    prepare: buildPrepare(format, tl),
    waveforms: buildWaveforms(format, tl),
    export: buildExport(format, tl),
  };
  for (const id of TOUR) {
    world.body.append(panels[id]);
    const { start, end } = shot(id);
    const from = id === "clean" ? start : start - LEAD - FLY;
    const to = id === "export" ? end : end + LEAD + BEAT / 4;
    showBetween(tl, panels[id], [[from, to]]);
  }
  tour(tl, world.cam, format);
  const end = buildEnd(format, tl);
  stage.append(end);
  showBetween(tl, end, [[shot("end").start, shot("end").end]]);
  stage.append(buildCaptions(format, tl));
  if (keysHud) stage.append(keysHud);
  return { sceneHost };
}
