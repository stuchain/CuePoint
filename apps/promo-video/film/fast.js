// What the three fast films (slam, grid, tunnel) share: the ten features, the moment of each recording they play,
// where in the window that moment happens, and a frame cache so a seek waits only for pictures it has not drawn yet.
import { clamp } from "./lib.js";

/** Frames each recording has in demo/frames/raw-<id> (30 fps, 2048 wide). */
export const CLIPS = { library: 326, player: 323, clean: 711, discover: 344, prepare: 350, keys: 233, statistics: 245, save: 285, export: 291, settings: 400 };

/**
 * One entry per feature: `from` clip seconds the film starts playing it at and `rate` how fast it plays (a film shows
 * each for a second or two, so most run quicker than life); `focus` the window point (1280 x 800) the action is at
 * and `z` how far a full-bleed crop zooms there; `word` the one-word name, `line` what it does.
 */
export const FEATURES = [
  { id: "library", word: "SEARCH", line: "Your whole Rekordbox library", from: 6.0, rate: 1.4, focus: [840, 330], z: 2.2 },
  { id: "player", word: "PLAY", line: "Waveforms and a real player", from: 2.0, rate: 1.6, focus: [640, 650], z: 2.0 },
  { id: "clean", word: "MATCH", line: "Every track checked on Beatport", from: 14.6, rate: 1.6, focus: [1010, 560], z: 2.3 },
  { id: "discover", word: "DIG", line: "New releases from your artists", from: 4.6, rate: 2.2, focus: [800, 470], z: 2.1 },
  { id: "prepare", word: "PLAN", line: "Sets with key and energy checks", from: 2.2, rate: 2.0, focus: [560, 330], z: 2.1 },
  { id: "keys", word: "MIX", line: "The key wheel finds what fits", from: 1.6, rate: 1.8, focus: [520, 400], z: 2.2 },
  { id: "statistics", word: "KNOW", line: "Statistics for every crate", from: 2.6, rate: 1.4, focus: [640, 520], z: 2.0 },
  { id: "save", word: "TAG", line: "Clean tags written to your files", from: 2.6, rate: 1.8, focus: [640, 260], z: 2.3 },
  { id: "export", word: "EXPORT", line: "Straight back into Rekordbox", from: 1.6, rate: 2.2, focus: [560, 240], z: 2.3 },
  { id: "settings", word: "YOURS", line: "Themes, sizes, your way", from: 2.0, rate: 3.0, focus: [640, 400], z: 1.6 },
];

const pad = (n) => String(n).padStart(5, "0");
/** The frame of recording `id` at clip second s. */
/** Frames where a recording flickers (Clean's cover art blanks for a few frames while the next one loads): [first, last, use]. */
const HOLES = { clean: [[540, 546, 539], [636, 645, 635]] };
const mend = (id, n) => (HOLES[id] ?? []).find(([a, b]) => n >= a && n <= b)?.[2] ?? n;
export const frameSrc = (id, s) => `../demo/frames/raw-${id}/${pad(mend(id, clamp(Math.round(s * 30) + 1, 1, CLIPS[id])))}.jpg`;
/** The frame feature f plays u seconds after it starts. */
export const featureSrc = (f, u) => frameSrc(f.id, f.from + f.rate * Math.max(0, u));

const cache = new Map();
/** A decoded Image for src (kept, the oldest dropped past a few hundred). */
export async function image(src) {
  let img = cache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    cache.set(src, img);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
  }
  if (!img.complete || !img.naturalWidth) await img.decode().catch(() => undefined);
  return img;
}

/** Set an <img>'s picture and wait until it can be drawn. */
export async function setSrc(el, src) {
  if (el.getAttribute("src") === src) return;
  await image(src);
  el.setAttribute("src", src);
  await el.decode().catch(() => undefined);
}

/** A kick: 1 on the beat, falling away over `len` seconds. */
export const kick = (t, beat, len = 0.22) => {
  const since = ((t % beat) + beat) % beat;
  return Math.exp(-since / (len / 3));
};

/** Key chips, one hue per step round the Camelot wheel, for the bits that fly about. */
export const KEY_CHIPS = [
  ["1A", "#5ee6c8"], ["2A", "#7df0b1"], ["3A", "#a6f07d"], ["4A", "#e2ec6f"], ["5A", "#ffcf6b"], ["6A", "#ffab6b"],
  ["7A", "#ff8b8b"], ["8A", "#ff7fb6"], ["9A", "#e48bff"], ["10A", "#b18bff"], ["11A", "#8ba6ff"], ["12A", "#6fcfff"],
];
