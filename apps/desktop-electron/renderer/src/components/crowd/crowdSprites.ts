/**
 * The crowd's pixel art (ported from the approved mockup): a seeded crowd, one dancer, and the club
 * around them, drawn onto a small logical canvas that CSS scales up with `image-rendering: pixelated`.
 *
 * Drawing is pure given a context: the same scene draws the same frame, and nothing here keeps state
 * or reads the clock. Colours come from the app theme (`paletteFrom`); the dancers' own skin, hair
 * and clothes are fixed so a crowd looks the same in every theme. Nothing ever flashes: beams and
 * floor tiles change slowly and softly, never a full-canvas flash.
 */
import type { CrowdMove } from "./crowdRules";

/** The logical canvas, in pixels ("in between" size): this big at least, and it grows with the window. */
export const CROWD_WIDTH = 232;
export const CROWD_HEIGHT = 130;
/** The biggest the logical club gets, so a huge window does not make the scene heavy. */
export const CROWD_MAX_WIDTH = 640;
export const CROWD_MAX_HEIGHT = 360;
/** The crowd on the smallest club (232 x 130); a bigger floor holds proportionally more, up to the cap. */
export const CROWD_COUNT = 36;
export const CROWD_COUNT_MAX = 160;
/** The depth of the smallest club's standing floor (feet from the back row to the front), in pixels. */
const FLOOR_DEPTH = 58;
/** The depth bands the dancers fall into; the nearest is the "front row" (it covers its ears). */
export const CROWD_ROWS = 4;
export const BOOTH_Y = 48;
export const CROWD_SEED = 8;

export type Pose = "down" | "up" | "out" | "pump" | "coverEars" | "clap" | "decks" | "deckUp";
export type DancerMove = "idle" | "sway" | "bob" | "step" | "jump";
/** The one extra move a dancer leans on (seeded). */
export type Favourite = "clap" | "step" | "hop" | "turn";
const FAVOURITES: readonly Favourite[] = ["clap", "step", "hop", "turn"];

export interface Dancer {
  x: number;
  /** Where the feet are. */
  y: number;
  /** 0 at the back, 1 at the front. */
  depth: number;
  /** The depth band, 0 (back) to `CROWD_ROWS - 1` (front). */
  row: number;
  skin: string;
  hair: string;
  hairStyle: number;
  shirt: string;
  pants: string;
  /** Which beats this dancer jumps or steps on. */
  off: number;
  style: number;
  /** Seconds behind the beat, so the crowd is not in lockstep. */
  lag: number;
  moodSeed: number;
  fav: Favourite;
}

const SKIN = ["#f1c7a5", "#d9a27c", "#b97b53", "#8d5a3b", "#5e3a26", "#f5d6bf"];
const HAIR = ["#1b1410", "#3d2614", "#7a4b1f", "#d9b15a", "#b33a2a", "#e8e2d6", "#6b3fd1", "#2bb5a6"];
const SHIRT = ["#e8e3f5", "#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#9164f6", "#f78c40", "#2d2a3e", "#ff5fa2", "#7bdff2"];
const PANTS = ["#1e1b2b", "#2c3e66", "#3a3a3a", "#4a3b2a", "#14141c"];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface ClubLayout {
  boothY: number;
  /** Where the floor starts (the booth's foot) and where the crowd's feet stand, back to front. */
  floorY: number;
  yTop: number;
  yBottom: number;
}

/**
 * Where things stand in a club `width` x `height` logical pixels: the booth sits 35% of the extra height
 * lower than in the smallest club, the floor runs from the booth's foot to the bottom edge and the
 * crowd stands between 22 px under the booth and 2 px above the edge.
 */
export function clubLayout(_width: number, height: number): ClubLayout {
  const boothY = BOOTH_Y + Math.round((height - CROWD_HEIGHT) * 0.35);
  return { boothY, floorY: boothY + 10, yTop: boothY + 22, yBottom: height - 2 };
}

/** How many dancers a floor `width` wide and `floorDepth` deep holds: 36 on the smallest club, more when bigger. */
export function crowdCountFor(width: number, floorDepth: number = FLOOR_DEPTH): number {
  return Math.min(CROWD_COUNT_MAX, Math.max(1, Math.round(CROWD_COUNT * (width / CROWD_WIDTH) * (floorDepth / FLOOR_DEPTH))));
}

/**
 * A packed crowd for a floor `width` wide, the same for a seed and a width: dancers bunched in front
 * of the booth (the middle of the floor) and thinning out to the sides, more spread the nearer the
 * front. Feet between `yTop` and `yBottom`; the list is back to front. A deeper floor holds more.
 */
export function makeCrowd(width: number, seed: number, yTop: number, yBottom: number): Dancer[] {
  const r = rng(seed);
  const list: Dancer[] = [];
  const count = crowdCountFor(width, yBottom - yTop);
  for (let i = 0; i < count; i += 1) {
    const depth = Math.pow(r(), 0.8);
    const spread = 0.22 + 0.32 * depth;
    // Three dice: most of the crowd is near the middle.
    const gx = (r() + r() + r() - 1.5) / 1.5;
    // A dancer and his arms are 6 px plus one either side.
    const x = Math.min(width - 9, Math.max(2, Math.round(width / 2 - 3 + gx * width * spread)));
    list.push({
      x,
      y: Math.round(yTop + depth * (yBottom - yTop)),
      depth,
      row: Math.min(CROWD_ROWS - 1, Math.floor(depth * CROWD_ROWS)),
      skin: SKIN[Math.floor(r() * SKIN.length)],
      hair: HAIR[Math.floor(r() * HAIR.length)],
      hairStyle: Math.floor(r() * 5),
      shirt: SHIRT[Math.floor(r() * SHIRT.length)],
      pants: PANTS[Math.floor(r() * PANTS.length)],
      off: Math.floor(r() * 4),
      style: Math.floor(r() * 3),
      lag: r() * 0.12,
      moodSeed: r(),
      fav: FAVOURITES[Math.floor(r() * FAVOURITES.length)],
    });
  }
  return list.sort((a, b) => a.y - b.y);
}

// ------------------------------------------------------------------ colour

type Rgb = [number, number, number];

/** `#rgb`, `#rrggbb` or `rgb()` / `rgba()`; null for anything else (a keyword, a var, empty). */
export function parseColour(text: string): Rgb | null {
  const value = text.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(value);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const fn = /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/.exec(value);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return null;
}

const css = ([r, g, b]: Rgb) =>
  `rgb(${Math.min(255, Math.max(0, Math.round(r)))},${Math.min(255, Math.max(0, Math.round(g)))},${Math.min(255, Math.max(0, Math.round(b)))})`;

/** `from` moved `k` (0..1) of the way to `to`. */
function mix(from: Rgb, to: Rgb, k: number): Rgb {
  return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k];
}

function shade(colour: string, k: number): string {
  const rgb = parseColour(colour) ?? [128, 128, 128];
  return css([rgb[0] * k, rgb[1] * k, rgb[2] * k]);
}

/** `colour` with an alpha of 0, for the end of a fade (the colour is kept so the fade stays clean). */
function clear(colour: string): string {
  const rgb = parseColour(colour) ?? [128, 128, 128];
  return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},0)`;
}

export interface ClubPalette {
  sky: [string, string];
  beam: string;
  beam2: string;
  floor: string;
  floorHi: string;
  booth: string;
  boothHi: string;
  /** The unlit floor tile and the booth screen's backing, worked out once. */
  floorTile: string;
  screen: string;
  /** The clip note's colour, from the theme's warning token. */
  warning: string;
}

export interface ThemeColours {
  /** `--accent-primary`. */
  accent: string;
  /** `--bg-app`. */
  bgApp: string;
  /** `--accent-warning`; optional. */
  warning?: string;
}

const DEFAULT_ACCENT = "#9164f6";
const DEFAULT_WARNING = "#eab308";
const DEFAULT_BG: Rgb = [24, 24, 27];
const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

/**
 * The club's colours from the theme: the accent lights the beams and the booth's edge, a lighter
 * accent is the second beam, and the sky, floor and booth are the app background taken dark and
 * leaned a little towards the accent. A token that cannot be read falls back to the default theme.
 */
export function paletteFrom(theme: ThemeColours): ClubPalette {
  const accentRgb = parseColour(theme.accent) ?? parseColour(DEFAULT_ACCENT)!;
  const accent = parseColour(theme.accent) ? theme.accent.trim() : DEFAULT_ACCENT;
  const bg = parseColour(theme.bgApp) ?? DEFAULT_BG;
  const dark = (k: number, lean: number) => mix(mix(bg, BLACK, k), accentRgb, lean);
  const floor = dark(0.55, 0.08);
  return {
    sky: [css(dark(0.7, 0.04)), css(dark(0.45, 0.14))],
    beam: accent,
    beam2: css(mix(accentRgb, WHITE, 0.45)),
    floor: css(floor),
    floorHi: css(mix(floor, accentRgb, 0.35)),
    booth: css(dark(0.4, 0.12)),
    boothHi: accent,
    floorTile: shade(css(floor), 1.25),
    screen: shade(css(dark(0.4, 0.12)), 0.55),
    warning: theme.warning && parseColour(theme.warning) ? theme.warning.trim() : DEFAULT_WARNING,
  };
}

// ------------------------------------------------------------------ poses and moves

const mod = (n: number, m: number) => ((n % m) + m) % m;

export interface PoseState {
  move: CrowdMove | DancerMove;
  cheer: boolean;
  ears: boolean;
  beat: number;
}

/** A dancer's arms, from what the crowd is doing: the mockup's tiers by beat, hands up to cheer. */
export function poseFor(d: Dancer, s: PoseState): Pose {
  if (s.move === "idle") return "down";
  if (s.ears && d.row === CROWD_ROWS - 1) return "coverEars";
  if (s.cheer) return "up";
  const b = s.beat + d.off;
  if (s.move === "jump") return (["up", "up", "pump", "up"] as const)[mod(b + d.style, 4)];
  if (s.move === "bob" || s.move === "step") return (["out", "pump", "down", "pump"] as const)[mod(b, 4)];
  return (["down", "out", "down", "down"] as const)[mod(b, 4)];
}

/** What one dancer does for the crowd's move: some step to the side instead of bobbing in place. */
export function moveFor(d: Dancer, move: CrowdMove): DancerMove {
  if (move === "bob" && d.style === 1) return "step";
  return move;
}

export interface FavouriteState {
  energy: number;
  /** What the crowd is doing now (after `moveFor`). */
  move: CrowdMove | DancerMove;
  cheer: boolean;
  /** This dancer has their hands over their ears. */
  ears: boolean;
  /** Whole beat and how far through it, shifted for this dancer's lag. */
  beat: number;
  phase: number;
}

export interface FavouriteMove {
  dx: number;
  dy: number;
  /** Back of the head to the room: hair over the face. */
  turned: boolean;
  clap: boolean;
}

const NO_FAVOURITE: FavouriteMove = { dx: 0, dy: 0, turned: false, clap: false };
/** The extra moves start above this energy; the clap a little higher. */
export const FAVOURITE_ENERGY = 0.3;
export const CLAP_ENERGY = 0.45;

/**
 * The dancer's favourite extra move at this moment, or nothing. A step shifts 2 px on alternate beats,
 * a hop is a small 2 px jump on every fourth beat, a turn shows the back of the head for 2 beats in
 * every 8, a clap brings the forearms in front of the chest with the hands meeting on the beat.
 * Nothing extra while the crowd is idle, cheering, or this dancer covers their ears.
 */
export function favouriteFor(d: Dancer, s: FavouriteState): FavouriteMove {
  if (s.move === "idle" || s.cheer || s.ears || s.energy <= FAVOURITE_ENERGY) return NO_FAVOURITE;
  switch (d.fav) {
    case "step":
      return { ...NO_FAVOURITE, dx: mod(s.beat + d.off, 2) ? 2 : 0 };
    case "hop":
      return mod(s.beat + d.off, 4) === 0 ? { ...NO_FAVOURITE, dy: -Math.round(2 * Math.sin(Math.PI * s.phase)) } : NO_FAVOURITE;
    case "turn":
      return mod(Math.floor(s.beat / 2) + d.off, 4) === 3 ? { ...NO_FAVOURITE, turned: true } : NO_FAVOURITE;
    default:
      return s.energy > CLAP_ENERGY ? { ...NO_FAVOURITE, clap: true } : NO_FAVOURITE;
  }
}

export interface DjState {
  move: CrowdMove;
  /** The DJ stands still: paused, or caught still by silence or a still frame. */
  still: boolean;
  build: boolean;
  drop: boolean;
  beat: number;
  phase: number;
}

export interface DjCue {
  pose: Pose;
  /** Pixels the head and body dip: 1 for the first 35% of each beat. */
  nod: number;
}

const NOD_PHASE = 0.35;

/**
 * What the DJ does: hands on the decks and a nod on every beat; one hand up on alternate beats
 * while the energy builds; both hands up when a drop lands. Paused (or still) the DJ stands still.
 */
export function djCue(s: DjState): DjCue {
  if (s.move === "idle" || s.still) return { pose: "decks", nod: 0 };
  const nod = s.phase < NOD_PHASE ? 1 : 0;
  if (s.drop) return { pose: "up", nod };
  if (s.build && mod(s.beat, 2) === 0) return { pose: "deckUp", nod };
  return { pose: "decks", nod };
}

export interface DancerMotion {
  move?: DancerMove;
  /** An extra move's offset, from `favouriteFor`. */
  shift?: { dx: number; dy: number };
  /** The back of the head shows (a turn). */
  turned?: boolean;
  /** Whole beat and how far through it, already shifted for this dancer's lag. */
  beat?: number;
  phase?: number;
  /** Caught still: no bounce, no sway. */
  still?: boolean;
}

function offsets(d: Dancer, m: DancerMotion): { dx: number; dy: number; foot: number } {
  const move = m.still ? "idle" : (m.move ?? "idle");
  const b = m.beat ?? 0;
  const f = m.phase ?? 0;
  const lead = mod(b + d.off, 2);
  switch (move) {
    case "jump":
      return {
        dx: 0,
        dy: lead === 0 && d.style !== 2 ? -Math.round(3 * Math.sin(Math.PI * f)) : f < 0.5 ? -1 : 0,
        foot: lead,
      };
    case "bob":
      return { dx: 0, dy: f < 0.5 ? -1 : 0, foot: lead };
    case "step":
      return { dx: lead, dy: f < 0.5 ? -1 : 0, foot: lead };
    case "sway":
      return { dx: mod(Math.floor(b / 2) + d.off, 2) === 0 ? 0 : 1, dy: 0, foot: -1 };
    default:
      return { dx: 0, dy: 0, foot: -1 };
  }
}

// ------------------------------------------------------------------ drawing

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.fillRect(x | 0, y | 0, w, h);
}

const SHOE = "rgb(17,16,24)";

interface Shades {
  light: number;
  sk: string;
  sh: string;
  shHi: string;
  pa: string;
  ha: string;
}

const shadeCache = new WeakMap<Dancer, Shades>();

/** A dancer's colours at a light level; they only change with depth, so they are worked out once. */
function shadesOf(d: Dancer, light: number): Shades {
  const known = shadeCache.get(d);
  if (known && known.light === light) return known;
  const made = {
    light,
    sk: shade(d.skin, light),
    sh: shade(d.shirt, light),
    shHi: shade(d.shirt, light * 1.15),
    pa: shade(d.pants, light),
    ha: shade(d.hair, light),
  };
  shadeCache.set(d, made);
  return made;
}

/**
 * One dancer, feet at (x, y): 6 px wide, 16 px tall, arms as `pose` says and the body as `motion`
 * moves it. `light` dims the back rows (1 is full colour).
 */
export function drawDancer(
  ctx: CanvasRenderingContext2D,
  d: Dancer,
  pose: Pose,
  light: number,
  motion: DancerMotion = {},
): void {
  const { dx, dy, foot } = offsets(d, motion);
  const { sk, sh, shHi, pa, ha } = shadesOf(d, light);
  const x = Math.round(d.x + dx + (motion.shift?.dx ?? 0));
  const y = Math.round(d.y + dy + (motion.shift?.dy ?? 0));

  // legs
  const lL = foot === 0 ? 4 : 5;
  const lR = foot === 1 ? 4 : 5;
  px(ctx, x + 1, y - lL, 2, lL, pa);
  px(ctx, x + 3, y - lR, 2, lR, pa);
  px(ctx, x + 1, y - 1, 2, 1, SHOE);
  px(ctx, x + 3, y - 1, 2, 1, SHOE);
  // torso
  px(ctx, x, y - 10, 6, 5, sh);
  px(ctx, x, y - 10, 6, 1, shHi);
  // head
  px(ctx, x + 1, y - 14, 4, 4, sk);
  switch (d.hairStyle) {
    case 0:
      px(ctx, x + 1, y - 15, 4, 2, ha);
      break;
    case 1:
      px(ctx, x + 1, y - 15, 4, 2, ha);
      px(ctx, x + 2, y - 17, 2, 2, ha);
      break;
    case 2:
      px(ctx, x, y - 15, 6, 2, ha);
      px(ctx, x, y - 13, 1, 4, ha);
      px(ctx, x + 5, y - 13, 1, 4, ha);
      break;
    case 3:
      px(ctx, x, y - 16, 6, 3, ha);
      break;
    default:
      px(ctx, x + 1, y - 15, 4, 1, ha);
      px(ctx, x + 1, y - 14, 5, 1, ha);
  }
  if (motion.turned) px(ctx, x + 1, y - 14, 4, 4, ha);
  // arms
  const L = x - 1;
  const R = x + 6;
  const b = motion.beat ?? 0;
  switch (pose) {
    case "down":
      px(ctx, L, y - 10, 1, 4, sh);
      px(ctx, R, y - 10, 1, 4, sh);
      px(ctx, L, y - 6, 1, 1, sk);
      px(ctx, R, y - 6, 1, 1, sk);
      break;
    case "up":
      px(ctx, L, y - 14, 1, 4, sh);
      px(ctx, R, y - 14, 1, 4, sh);
      px(ctx, L, y - 15, 1, 1, sk);
      px(ctx, R, y - 15, 1, 1, sk);
      break;
    case "out":
      px(ctx, L - 2, y - 10, 3, 1, sh);
      px(ctx, R, y - 10, 3, 1, sh);
      px(ctx, L - 3, y - 10, 1, 1, sk);
      px(ctx, R + 3, y - 10, 1, 1, sk);
      break;
    case "coverEars":
      // Hands flat on either side of the head.
      px(ctx, L, y - 12, 1, 3, sh);
      px(ctx, R, y - 12, 1, 3, sh);
      px(ctx, L + 1, y - 14, 1, 3, sk);
      px(ctx, R - 1, y - 14, 1, 3, sk);
      break;
    case "clap": {
      // Forearms across the chest; the hands meet on the beat and open again.
      const open = (motion.phase ?? 0) > 0.25;
      px(ctx, L, y - 10, 1, 3, sh);
      px(ctx, R, y - 10, 1, 3, sh);
      px(ctx, x, y - 8, 1, 1, shHi);
      px(ctx, x + 5, y - 8, 1, 1, shHi);
      if (open) {
        px(ctx, x + 1, y - 8, 1, 1, sk);
        px(ctx, x + 4, y - 8, 1, 1, sk);
      } else {
        px(ctx, x + 1, y - 8, 1, 1, shHi);
        px(ctx, x + 4, y - 8, 1, 1, shHi);
        px(ctx, x + 2, y - 8, 2, 1, sk);
      }
      break;
    }
    case "decks":
    case "deckUp":
      // Forearms out over the decks; for a build the right hand goes up instead.
      px(ctx, L - 2, y - 9, 3, 1, sh);
      px(ctx, L - 3, y - 8, 1, 1, sk);
      if (pose === "deckUp") {
        px(ctx, R, y - 14, 1, 4, sh);
        px(ctx, R, y - 15, 1, 1, sk);
      } else {
        px(ctx, R, y - 9, 3, 1, sh);
        px(ctx, R + 2, y - 8, 1, 1, sk);
      }
      break;
    default: {
      const up = (motion.phase ?? 0) < 0.5;
      if (mod(b + d.off, 2)) {
        px(ctx, L, y - (up ? 14 : 12), 1, up ? 4 : 2, sh);
        px(ctx, L, y - (up ? 15 : 13), 1, 1, sk);
        px(ctx, R, y - 10, 1, 4, sh);
        px(ctx, R, y - 6, 1, 1, sk);
      } else {
        px(ctx, R, y - (up ? 14 : 12), 1, up ? 4 : 2, sh);
        px(ctx, R, y - (up ? 15 : 13), 1, 1, sk);
        px(ctx, L, y - 10, 1, 4, sh);
        px(ctx, L, y - 6, 1, 1, sk);
      }
    }
  }
}

// ------------------------------------------------------------------ pixel text

/** A 3 x 5 face, one number a row, the left pixel the highest bit. */
const GLYPHS: Record<string, readonly number[]> = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 7, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  "0": [7, 5, 5, 5, 7], "1": [2, 6, 2, 2, 7], "2": [6, 1, 2, 4, 7], "3": [6, 1, 2, 1, 6], "4": [5, 5, 7, 1, 1],
  "5": [7, 4, 6, 1, 6], "6": [3, 4, 7, 5, 7], "7": [7, 1, 2, 2, 2], "8": [7, 5, 7, 5, 7], "9": [7, 5, 7, 1, 6],
  " ": [0, 0, 0, 0, 0], "-": [0, 0, 7, 0, 0], ".": [0, 0, 0, 0, 2], "!": [2, 2, 2, 0, 2], "?": [6, 1, 2, 0, 2],
  "'": [2, 2, 0, 0, 0], ",": [0, 0, 0, 2, 4], "(": [1, 2, 2, 2, 1], ")": [4, 2, 2, 2, 4], "&": [2, 5, 2, 5, 3],
  "/": [1, 1, 2, 4, 4], ":": [0, 2, 0, 2, 0],
};

const GLYPH_ADVANCE = 4;

/** The letters a title can draw: accents dropped, upper case, anything else a question mark. */
export function pixelTextOf(text: string): string {
  return [...text.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()]
    .map((c) => (GLYPHS[c] ? c : "?"))
    .join("");
}

export function pixelTextWidth(text: string): number {
  return Math.max(0, pixelTextOf(text).length * GLYPH_ADVANCE - 1);
}

/** Draw `text` at (x, y); only glyphs wholly inside [x, x + maxWidth) after `scroll` px are drawn. */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  colour: string,
  maxWidth: number,
  scroll = 0,
): void {
  const letters = pixelTextOf(text);
  ctx.fillStyle = colour;
  for (let i = 0; i < letters.length; i += 1) {
    const left = i * GLYPH_ADVANCE - scroll;
    if (left < 0 || left + 3 > maxWidth) continue;
    const rows = GLYPHS[letters[i]];
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        if (rows[row] & (4 >> col)) ctx.fillRect(x + left + col, y + row, 1, 1);
      }
    }
  }
}

// ------------------------------------------------------------------ the club

export interface ClubScene {
  width: number;
  height: number;
  boothY: number;
  palette: ClubPalette;
  crowd: readonly Dancer[];
  /** 0..1. */
  energy: number;
  move: CrowdMove;
  cheer: boolean;
  freeze: boolean;
  clip: boolean;
  clipNote: boolean;
  /** A drop has just landed (the DJ's hands go up) and the energy is building (one hand up). */
  drop: boolean;
  build: boolean;
  /** A still frame (motion off): no pulse, no nod, no extra moves. */
  still?: boolean;
  /** Whole beat (already snapped to the bar by the beat clock, so `beat % 4` is the beat of the bar). */
  beat: number;
  phase: number;
  /** The current tempo, for the booth screen; null with no track (no title, no tempo known): no tempo line. */
  bpm: number | null;
  /** Keeps the static backdrop between frames (see `createBackdropCache`); without one it is drawn each frame. */
  backdrop?: BackdropCache;
  /** Seconds, for the slow beam sweep and the title's scroll. */
  time: number;
  /** The playing track's title for the booth screen; empty for none. */
  title: string;
}

const DJ: Dancer = {
  x: 0, y: 0, depth: 1, row: 0, skin: "#d9a27c", hair: "#1b1410", hairStyle: 4,
  shirt: "#2d2a3e", pants: "#14141c", off: 0, style: 2, lag: 0, moodSeed: 0, fav: "clap",
};

const RIG = "#2a2838";
const LAMP = "#3a3750";
const BEATS_PER_SWEEP = 8;
/** The most a beam is ever lit, however loud: a beat brightens it softly, never past this. */
export const BEAM_ALPHA_MAX = 0.45;
const BEAM_PULSE = 0.16;

/** How much the lights swell on the beat: 1 at the beat, fading out before the next; 0 while quiet or still. */
export function beatPulse(energy: number, phase: number, still: boolean): number {
  return !still && energy > 0.5 ? Math.pow(1 - phase, 2) : 0;
}

/** The sky and the rig's bar and lamps: nothing in them moves, so they are painted once per size and palette. */
function paintSky(g: CanvasRenderingContext2D, W: number, H: number, pal: ClubPalette): void {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, pal.sky[0]);
  grd.addColorStop(1, pal.sky[1]);
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  px(g, 0, 3, W, 2, RIG);
  const lamps = lampCount(W);
  for (let i = 0; i < lamps; i += 1) {
    const lx = lampX(i, lamps, W);
    px(g, lx - 2, 5, 4, 3, LAMP);
    px(g, lx - 1, 7, 2, 1, i % 2 ? pal.beam : pal.beam2);
  }
}

/** The floor and its tiles, which no longer blink. */
function paintFloor(g: CanvasRenderingContext2D, W: number, H: number, pal: ClubPalette, floorY: number): void {
  px(g, 0, floorY, W, H - floorY, pal.floor);
  for (let yy = floorY + 2; yy < H; yy += 6) {
    for (let xx = ((yy / 6) | 0) % 2 ? 0 : 6; xx < W; xx += 12) px(g, xx, yy, 10, 4, pal.floorTile);
  }
}

const lampCount = (W: number) => Math.max(3, Math.round(W / 50));
const lampX = (i: number, lamps: number, W: number) => Math.round(((i + 0.5) * W) / lamps);

/** The static layers of a club, kept between frames; rebuilt when the size or the palette changes. */
export interface BackdropCache {
  palette: ClubPalette | null;
  width: number;
  height: number;
  floorY: number;
  sky: CanvasImageSource | null;
  floor: CanvasImageSource | null;
}

export function createBackdropCache(): BackdropCache {
  return { palette: null, width: 0, height: 0, floorY: 0, sky: null, floor: null };
}

function layer(W: number, H: number, paint: (g: CanvasRenderingContext2D) => void): CanvasImageSource | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  paint(g);
  return canvas;
}

function backdropFor(cache: BackdropCache, W: number, H: number, pal: ClubPalette, floorY: number): BackdropCache {
  if (cache.palette !== pal || cache.width !== W || cache.height !== H || cache.floorY !== floorY || !cache.sky || !cache.floor) {
    cache.palette = pal;
    cache.width = W;
    cache.height = H;
    cache.floorY = floorY;
    cache.sky = layer(W, H, (g) => paintSky(g, W, H, pal));
    cache.floor = layer(W, H, (g) => paintFloor(g, W, H, pal, floorY));
  }
  return cache;
}

export function drawClub(ctx: CanvasRenderingContext2D, scene: ClubScene): void {
  const { width: W, height: H, palette: pal, boothY } = scene;
  const e = scene.energy;
  const still = scene.still === true;
  const bpos = scene.beat + scene.phase;
  const pulse = beatPulse(e, scene.phase, still);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;

  const floorY = boothY + 10;
  const cached = scene.backdrop ? backdropFor(scene.backdrop, W, H, pal, floorY) : null;
  // sky and the rig's fixtures
  if (cached?.sky) ctx.drawImage(cached.sky, 0, 0);
  else paintSky(ctx, W, H, pal);

  // light rig: beams sweep slowly, brighten with the energy and swell softly on each beat
  const lamps = lampCount(W);
  for (let i = 0; i < lamps; i += 1) {
    const lx = lampX(i, lamps, W);
    const ang = Math.sin((bpos / BEATS_PER_SWEEP) * Math.PI * 2 + i * 1.3) * 0.6;
    const len = H * 0.95;
    ctx.save();
    ctx.globalAlpha = Math.min(BEAM_ALPHA_MAX, 0.08 + 0.22 * e + BEAM_PULSE * pulse);
    ctx.fillStyle = i % 2 ? pal.beam : pal.beam2;
    ctx.beginPath();
    ctx.moveTo(lx, 8);
    ctx.lineTo(lx + Math.sin(ang) * len - 10, 8 + Math.cos(ang) * len);
    ctx.lineTo(lx + Math.sin(ang) * len + 10, 8 + Math.cos(ang) * len);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // booth and DJ
  const bw = Math.min(90, Math.round(W * 0.34));
  const bx = Math.round(W / 2 - bw / 2);
  const dj = DJ;
  const cue = djCue({
    move: scene.move,
    still: still || scene.freeze,
    build: scene.build,
    drop: scene.drop,
    beat: scene.beat,
    phase: scene.phase,
  });
  dj.x = Math.round(W / 2 - 3);
  dj.y = boothY + cue.nod;
  drawDancer(ctx, dj, cue.pose, 1, { move: "idle", still: true });
  px(ctx, bx, boothY - 4, bw, 14, pal.booth);
  px(ctx, bx, boothY - 4, bw, 1, pal.boothHi);
  px(ctx, bx + 6, boothY - 6, 14, 2, LAMP);
  px(ctx, bx + bw - 20, boothY - 6, 14, 2, LAMP);
  // screen: the title on the first line (or the clip note for two seconds), the tempo under it in a
  // dimmer shade and four dots that step through the bar
  const screenW = bw - 8;
  px(ctx, bx + 3, boothY - 3, bw - 6, 12, pal.screen);
  ctx.globalAlpha = 0.9;
  if (scene.clipNote) {
    drawPixelText(ctx, "CLIPPING", bx + 4, boothY - 2, pal.warning, screenW);
  } else if (scene.title) {
    const textW = pixelTextWidth(scene.title);
    const scroll = textW > screenW ? Math.floor(scene.time * 8) % (textW + 12) : 0;
    drawPixelText(ctx, scene.title, bx + 4, boothY - 2, pal.boothHi, screenW, scroll);
  }
  if (scene.bpm !== null) {
    ctx.globalAlpha = 0.55;
    drawPixelText(ctx, `${Math.round(scene.bpm)} BPM`, bx + 4, boothY + 4, pal.boothHi, screenW - 17);
    const bar = mod(scene.beat, 4);
    for (let i = 0; i < 4; i += 1) {
      ctx.globalAlpha = i === bar ? 1 : 0.3;
      px(ctx, bx + bw - 21 + i * 4, boothY + 5, 3, 3, i === bar ? pal.beam2 : pal.boothHi);
    }
  }
  ctx.globalAlpha = 1;

  // floor
  if (cached?.floor) ctx.drawImage(cached.floor, 0, 0);
  else paintFloor(ctx, W, H, pal, floorY);
  // a soft pool of light under the crowd: swells with the energy and a little on the beat
  {
    const cx = W / 2;
    const cy = floorY + (H - floorY) * 0.55;
    const rx = W * 0.42;
    const ry = (H - floorY) * 0.5;
    const rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
    rg.addColorStop(0, pal.beam2);
    rg.addColorStop(1, clear(pal.beam2));
    ctx.save();
    ctx.globalAlpha = 0.1 + 0.22 * e + 0.08 * pulse;
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // crowd, back to front: the back rows sit darker
  for (const d of scene.crowd) {
    const light = 0.35 + 0.65 * d.depth;
    const shifted = bpos - d.lag * 2;
    const b = Math.floor(shifted);
    const phase = shifted - b;
    let move = moveFor(d, scene.move);
    if (scene.cheer && move === "sway") move = "bob";
    const motion: DancerMotion = { move, beat: b, phase, still: scene.freeze || still };
    let pose: Pose = scene.freeze
      ? "out"
      : poseFor(d, { move, cheer: scene.cheer, ears: scene.clip, beat: b });
    if (!scene.freeze && !still) {
      const extra = favouriteFor(d, {
        energy: e,
        move,
        cheer: scene.cheer,
        ears: pose === "coverEars",
        beat: b,
        phase,
      });
      motion.shift = { dx: extra.dx, dy: extra.dy };
      motion.turned = extra.turned;
      if (extra.clap) pose = "clap";
    }
    drawDancer(ctx, d, pose, light, motion);
  }
}
