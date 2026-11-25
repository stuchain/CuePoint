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

/** The logical canvas, in pixels ("in between" size). */
export const CROWD_WIDTH = 232;
export const CROWD_HEIGHT = 130;
export const CROWD_COUNT = 24;
export const CROWD_ROWS = 4;
export const BOOTH_Y = 48;
export const CROWD_SEED = 8;

export type Pose = "down" | "up" | "out" | "pump" | "coverEars";
export type DancerMove = "idle" | "sway" | "bob" | "step" | "jump";

export interface Dancer {
  x: number;
  /** Where the feet are. */
  y: number;
  /** 0 at the back row, 1 at the front. */
  depth: number;
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

/**
 * `count` dancers over `rows` depth rows between `yTop` and `yBottom` (feet), the same for a seed.
 * Rows are dealt out in turn so every row is filled; the list is back to front.
 */
export function makeCrowd(
  count: number,
  width: number,
  rows: number,
  seed: number,
  yTop: number,
  yBottom: number,
): Dancer[] {
  const r = rng(seed);
  const list: Dancer[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = i % rows;
    const depth = rows === 1 ? 1 : row / (rows - 1);
    list.push({
      x: Math.floor(r() * (width - 11)) + 2,
      y: Math.round(yTop + depth * (yBottom - yTop)),
      depth,
      row,
      skin: SKIN[Math.floor(r() * SKIN.length)],
      hair: HAIR[Math.floor(r() * HAIR.length)],
      hairStyle: Math.floor(r() * 5),
      shirt: SHIRT[Math.floor(r() * SHIRT.length)],
      pants: PANTS[Math.floor(r() * PANTS.length)],
      off: Math.floor(r() * 4),
      style: Math.floor(r() * 3),
      lag: r() * 0.12,
      moodSeed: r(),
    });
  }
  // Stable: dancers of one row keep the order they were dealt in.
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

export interface DancerMotion {
  move?: DancerMove;
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
  const x = Math.round(d.x + dx);
  const y = Math.round(d.y + dy);

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
  beat: number;
  phase: number;
  /** Seconds, for the slow beam sweep and the title's scroll. */
  time: number;
  /** The playing track's title for the booth screen; empty for none. */
  title: string;
}

const DJ: Dancer = {
  x: 0, y: 0, depth: 1, row: 0, skin: "#d9a27c", hair: "#1b1410", hairStyle: 4,
  shirt: "#2d2a3e", pants: "#14141c", off: 0, style: 2, lag: 0, moodSeed: 0,
};

const RIG = "#2a2838";
const LAMP = "#3a3750";
const BEATS_PER_SWEEP = 8;

export function drawClub(ctx: CanvasRenderingContext2D, scene: ClubScene): void {
  const { width: W, height: H, palette: pal, boothY } = scene;
  const e = scene.energy;
  const bpos = scene.beat + scene.phase;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;

  // sky
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, pal.sky[0]);
  grd.addColorStop(1, pal.sky[1]);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // light rig: beams sweep slowly and brighten with the energy, never flash
  px(ctx, 0, 3, W, 2, RIG);
  const lamps = Math.max(3, Math.round(W / 50));
  for (let i = 0; i < lamps; i += 1) {
    const lx = Math.round(((i + 0.5) * W) / lamps);
    px(ctx, lx - 2, 5, 4, 3, LAMP);
    const ang = Math.sin((bpos / BEATS_PER_SWEEP) * Math.PI * 2 + i * 1.3) * 0.6;
    const len = H * 0.95;
    ctx.save();
    ctx.globalAlpha = 0.08 + 0.22 * e;
    ctx.fillStyle = i % 2 ? pal.beam : pal.beam2;
    ctx.beginPath();
    ctx.moveTo(lx, 8);
    ctx.lineTo(lx + Math.sin(ang) * len - 10, 8 + Math.cos(ang) * len);
    ctx.lineTo(lx + Math.sin(ang) * len + 10, 8 + Math.cos(ang) * len);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    px(ctx, lx - 1, 7, 2, 1, i % 2 ? pal.beam : pal.beam2);
  }

  // booth and DJ
  const bw = Math.min(90, Math.round(W * 0.34));
  const bx = Math.round(W / 2 - bw / 2);
  const dj = DJ;
  const djMove: DancerMove = scene.move === "idle" ? "idle" : scene.move === "sway" ? "sway" : "bob";
  const djMotion: DancerMotion = { move: djMove, beat: scene.beat, phase: scene.phase, still: scene.freeze };
  dj.x = W / 2 - 3;
  dj.y = boothY;
  drawDancer(ctx, dj, scene.freeze ? "down" : poseFor(dj, { move: djMove, cheer: false, ears: false, beat: scene.beat }), 1, djMotion);
  px(ctx, bx, boothY - 4, bw, 14, pal.booth);
  px(ctx, bx, boothY - 4, bw, 1, pal.boothHi);
  px(ctx, bx + 6, boothY - 6, 14, 2, LAMP);
  px(ctx, bx + bw - 20, boothY - 6, 14, 2, LAMP);
  // screen: the playing title, or the clip note for two seconds
  const screenW = bw - 8;
  px(ctx, bx + 3, boothY - 1, bw - 6, 7, pal.screen);
  ctx.globalAlpha = 0.9;
  if (scene.clipNote) {
    drawPixelText(ctx, "CLIPPING", bx + 4, boothY, pal.warning, screenW);
  } else if (scene.title) {
    const textW = pixelTextWidth(scene.title);
    const scroll = textW > screenW ? Math.floor(scene.time * 8) % (textW + 12) : 0;
    drawPixelText(ctx, scene.title, bx + 4, boothY, pal.boothHi, screenW, scroll);
  }
  ctx.globalAlpha = 1;

  // floor: tiles light up a few at a time and change every two beats
  const floorY = boothY + 10;
  px(ctx, 0, floorY, W, H - floorY, pal.floor);
  const pulse = Math.floor(scene.beat / 2);
  for (let yy = floorY + 2; yy < H; yy += 6) {
    for (let xx = ((yy / 6) | 0) % 2 ? 0 : 6; xx < W; xx += 12) {
      const lit = mod(pulse + xx / 12 + yy / 6, 5) === 0 && e > 0.5;
      px(ctx, xx, yy, 10, 4, lit ? pal.floorHi : pal.floorTile);
    }
  }

  // crowd, back to front
  for (const d of scene.crowd) {
    const light = 0.45 + 0.55 * d.depth;
    const shifted = bpos - d.lag * 2;
    const b = Math.floor(shifted);
    const phase = shifted - b;
    let move = moveFor(d, scene.move);
    if (scene.cheer && move === "sway") move = "bob";
    const motion: DancerMotion = { move, beat: b, phase, still: scene.freeze };
    const pose: Pose = scene.freeze
      ? "out"
      : poseFor(d, { move, cheer: scene.cheer, ears: scene.clip, beat: b });
    drawDancer(ctx, d, pose, light, motion);
  }
}
