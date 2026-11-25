/**
 * The crowd's pixel art, ported from the app (apps/desktop-electron/renderer/src/components/crowd/
 * crowdSprites.ts; the site does not import across apps, so what the strip needs is copied here): a
 * seeded crowd, one dancer, the poses and moves. Drawing is pure given a context: the same crowd at the
 * same time draws the same frame. The dancers' skin, hair and clothes are fixed, so the crowd looks the
 * same in every theme; the floor under them is the page's (CSS tokens).
 */
import { beatsAt, moveAt, type CrowdMove } from "./pattern";

export const CROWD_COUNT = 24;
export const CROWD_SEED = 8;

export type Pose = "down" | "up" | "out" | "pump";
export type DancerMove = "idle" | CrowdMove | "step";

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
}

const SKIN = ["#f1c7a5", "#d9a27c", "#b97b53", "#8d5a3b", "#5e3a26", "#f5d6bf"];
const HAIR = ["#1b1410", "#3d2614", "#7a4b1f", "#d9b15a", "#b33a2a", "#e8e2d6", "#6b3fd1", "#2bb5a6"];
const SHIRT = ["#e8e3f5", "#ef476f", "#ffd166", "#06d6a0", "#118ab2", "#9164f6", "#f78c40", "#2d2a3e", "#ff5fa2", "#7bdff2"];
const PANTS = ["#1e1b2b", "#2c3e66", "#3a3a3a", "#4a3b2a", "#14141c"];

/** One of `list` for a draw `u` from 0 up to 1. */
function pick<T>(list: readonly T[], u: number): T {
  return list[Math.floor(u * list.length)] as T;
}

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
export function makeCrowd(count: number, width: number, rows: number, seed: number, yTop: number, yBottom: number): Dancer[] {
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
      skin: pick(SKIN, r()),
      hair: pick(HAIR, r()),
      hairStyle: Math.floor(r() * 5),
      shirt: pick(SHIRT, r()),
      pants: pick(PANTS, r()),
      off: Math.floor(r() * 4),
      style: Math.floor(r() * 3),
      lag: r() * 0.12,
    });
  }
  // stable: dancers of one row keep the order they were dealt in
  return list.sort((a, b) => a.y - b.y);
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** `#rrggbb` darkened to `k` of its light, as an rgb() string. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.min(255, Math.max(0, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** A dancer's arms for the crowd's move, by beat: the app's tiers, hands up on the drop. */
export function poseFor(d: Dancer, move: DancerMove, beat: number): Pose {
  if (move === "idle") return "down";
  const b = beat + d.off;
  if (move === "jump") return (["up", "up", "pump", "up"] as const)[mod(b + d.style, 4)] as Pose;
  if (move === "bob" || move === "step") return (["out", "pump", "down", "pump"] as const)[mod(b, 4)] as Pose;
  return (["down", "out", "down", "down"] as const)[mod(b, 4)] as Pose;
}

/** What one dancer does for the crowd's move: some step to the side instead of bobbing in place. */
export function moveFor(d: Dancer, move: CrowdMove): DancerMove {
  return move === "bob" && d.style === 1 ? "step" : move;
}

export interface DancerMotion {
  move?: DancerMove;
  /** Whole beat and how far through it, already shifted for this dancer's lag. */
  beat?: number;
  phase?: number;
}

function offsets(d: Dancer, m: DancerMotion): { dx: number; dy: number; foot: number } {
  const move = m.move ?? "idle";
  const b = m.beat ?? 0;
  const f = m.phase ?? 0;
  const lead = mod(b + d.off, 2);
  switch (move) {
    case "jump":
      return { dx: 0, dy: lead === 0 && d.style !== 2 ? -Math.round(3 * Math.sin(Math.PI * f)) : f < 0.5 ? -1 : 0, foot: lead };
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

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.fillRect(x | 0, y | 0, w, h);
}

const SHOE = "rgb(17,16,24)";

/**
 * One dancer, feet at (x, y): 6 px wide, 16 px tall, arms as `pose` says and the body as `motion`
 * moves it. `light` dims the back rows (1 is full colour).
 */
export function drawDancer(ctx: CanvasRenderingContext2D, d: Dancer, pose: Pose, light: number, motion: DancerMotion = {}): void {
  const { dx, dy, foot } = offsets(d, motion);
  const sk = shade(d.skin, light);
  const sh = shade(d.shirt, light);
  const shHi = shade(d.shirt, light * 1.15);
  const pa = shade(d.pants, light);
  const ha = shade(d.hair, light);
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

/** One frame of the crowd at `seconds` of the pattern, back to front, on a cleared canvas. */
export function drawCrowd(ctx: CanvasRenderingContext2D, crowd: readonly Dancer[], seconds: number, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  const bpos = beatsAt(seconds);
  const crowdMove = moveAt(seconds);
  for (const d of crowd) {
    const shifted = bpos - d.lag * 2;
    const beat = Math.floor(shifted);
    const move = moveFor(d, crowdMove);
    drawDancer(ctx, d, poseFor(d, move, beat), 0.45 + 0.55 * d.depth, { move, beat, phase: shifted - beat });
  }
}
