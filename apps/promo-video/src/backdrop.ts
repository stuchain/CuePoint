import { PIXEL_SIZE } from "../../website/src/three/pixel";

/**
 * The 3D space behind the app shots, drawn at the site's pixel size and scaled up without smoothing: a
 * dim floor grid drifting toward the camera and a few squares of the twelve key colors floating past.
 * It stays quiet so the app in front of it reads. Every frame is a pure function of time, so the render
 * is the same every run.
 */

export interface Backdrop {
  readonly canvas: HTMLCanvasElement;
  draw(t: number): void;
}

/** A fixed pseudo-random number for particle i, slot k (no Math.random: frames must repeat). */
const hash = (i: number, k: number): number => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function createBackdrop(width: number, height: number, colors: readonly string[]): Backdrop {
  const w = Math.ceil(width / PIXEL_SIZE);
  const h = Math.ceil(height / PIXEL_SIZE);
  const canvas = document.createElement("canvas");
  canvas.className = "backdrop";
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string): string => css.getPropertyValue(name).trim();
  const bg = v("--bg-app");
  const grid = v("--accent-primary-pressed");
  const glow = v("--accent-primary");
  const deep = v("--bg-panel");

  const horizon = Math.round(h * 0.55);
  const fov = h * 0.9;
  const PARTICLES = 28;

  return {
    canvas,
    draw(t) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      // a faint, steady band of light on the horizon
      ctx.fillStyle = deep;
      ctx.fillRect(0, horizon - 6, w, 6);
      ctx.fillStyle = glow;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(0, horizon - 2, w, 2);
      ctx.globalAlpha = 1;

      // the floor: lines across, moving toward us; lines into the distance, fanning from the middle
      ctx.fillStyle = grid;
      const speed = 2.5; // world units a second
      const spacing = 2;
      const offset = (t * speed) % spacing;
      for (let z = 40; z > 0.8; z -= spacing) {
        const zz = z - offset;
        if (zz <= 0.6) continue;
        const y = Math.round(horizon + (1.6 * fov) / zz);
        if (y >= h) continue;
        ctx.globalAlpha = 0.45 * Math.min(1, 6 / zz);
        ctx.fillRect(0, y, w, 1);
      }
      ctx.globalAlpha = 0.3;
      for (let x = -20; x <= 20; x += 2) {
        // a straight line from the vanishing point to where it meets the bottom edge
        const xb = w / 2 + (x * fov) / 1.6 / 4;
        const steps = h - horizon;
        for (let s = 2; s < steps; s += 1) {
          const u = s / steps;
          ctx.fillRect(Math.round(w / 2 + (xb - w / 2) * u), horizon + s, 1, 1);
        }
      }

      ctx.globalAlpha = 1;
      // key-colored squares drifting out of the distance
      for (let i = 0; i < PARTICLES; i++) {
        const life = 5 + hash(i, 1) * 3;
        const phase = ((t + hash(i, 2) * life) % life) / life; // 0 far .. 1 past the camera
        const z = 30 * (1 - phase) + 0.5;
        const ang = hash(i, 3) * Math.PI * 2;
        const r = 2 + hash(i, 4) * 6;
        const sx = w / 2 + (Math.cos(ang) * r * fov) / z;
        const sy = horizon * 0.7 + (Math.sin(ang) * r * fov * 0.6) / z;
        const size = Math.max(1, Math.round(8 / z));
        if (sx < -size || sx > w || sy < -size || sy > h) continue;
        ctx.fillStyle = colors[i % colors.length]!;
        ctx.globalAlpha = 0.6 * Math.min(1, phase * 3);
        ctx.fillRect(Math.round(sx), Math.round(sy), size, size);
      }
      ctx.globalAlpha = 1;
    },
  };
}
