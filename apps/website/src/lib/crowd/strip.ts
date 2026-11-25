/**
 * The dancing strip on the home page (the hero's foot). The markup and the reserved size are CSS
 * (components/CrowdStrip.astro); this wires the canvas to the loop once the page is idle.
 *
 * The logical canvas is STRIP_HEIGHT tall and as wide as the strip needs at the CSS scale
 * (`--crowd-scale`, a whole number of screen pixels per logical pixel), so every pixel is drawn
 * square and the strip fills the width at any screen.
 */
import { createLoop, type Loop } from "./loop";
import { CROWD_COUNT, CROWD_SEED, drawCrowd, makeCrowd, type Dancer } from "./sprites";

export const STRIP_HEIGHT = 34;
export const STRIP_ROWS = 3;
const DEFAULT_SCALE = 3;
/** Where the back and the front row's feet stand, in logical pixels. */
const FEET_BACK = 20;
const FEET_FRONT = 29;

/** The whole-number scale CSS gives (`--crowd-scale`); the default when it is not one. */
export function readScale(text: string): number {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_SCALE;
}

export interface Layout {
  /** Logical pixels. */
  w: number;
  h: number;
  scale: number;
  /** The canvas's CSS size: whole multiples of the logical size, so every pixel is square. */
  cssWidth: number;
  cssHeight: number;
}

/** The logical canvas that covers `cssWidth` at the scale `scaleText` (CSS's `--crowd-scale`); null for a box with no width. */
export function layoutFor(cssWidth: number, scaleText: string): Layout | null {
  if (!(cssWidth > 0)) return null;
  const scale = readScale(scaleText);
  const w = Math.max(1, Math.ceil(cssWidth / scale));
  return { w, h: STRIP_HEIGHT, scale, cssWidth: w * scale, cssHeight: STRIP_HEIGHT * scale };
}

/** The strip may stand where it is wholly below the copy (or where there is no copy). */
export function fits(strip: { top: number }, copy: { bottom: number } | null): boolean {
  return copy === null || strip.top >= copy.bottom;
}

interface NetworkInformation {
  saveData?: boolean;
}

/**
 * Starts the strip drawn on `canvas`; returns its loop (to stop it), or null where there is no 2D context.
 * The strip's box carries `data-state`: running, still (reduced motion or saveData) or hidden (where it
 * would sit on the hero's copy: the copy always wins).
 */
export function mountStrip(canvas: HTMLCanvasElement): Loop | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const host = canvas.parentElement ?? canvas;
  let crowd: Dancer[] = [];
  let layout: Layout | null = null;
  let seconds = 0;
  let onScreen = true;
  let fit = true;
  const paint = () => {
    if (layout) drawCrowd(ctx, crowd, seconds, layout.w, layout.h);
  };
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const saveData = connection?.saveData === true;
  const loop = createLoop(
    (t) => {
      seconds = t;
      paint();
    },
    {
      reducedMotion: reducedQuery.matches,
      saveData,
      raf: (cb) => requestAnimationFrame(cb),
      caf: (id) => cancelAnimationFrame(id),
    },
  );
  const state = () => {
    host.setAttribute("data-state", !fit ? "hidden" : reducedQuery.matches || saveData ? "still" : "running");
  };
  const update = () => {
    const next = layoutFor(host.clientWidth, getComputedStyle(canvas).getPropertyValue("--crowd-scale"));
    if (next && (!layout || next.w !== layout.w || next.scale !== layout.scale)) {
      layout = next;
      // setting the size clears the canvas: the same crowd for this width, painted again at once
      canvas.width = next.w;
      canvas.height = next.h;
      canvas.style.width = `${next.cssWidth}px`;
      canvas.style.height = `${next.cssHeight}px`;
      crowd = makeCrowd(CROWD_COUNT, next.w, STRIP_ROWS, CROWD_SEED, FEET_BACK, FEET_FRONT);
      paint();
    }
    const copy = document.querySelector("[data-hero-copy]");
    fit = fits(host.getBoundingClientRect(), copy ? copy.getBoundingClientRect() : null);
    loop.setOnScreen(onScreen && fit);
    state();
  };
  update();
  loop.setVisible(document.visibilityState !== "hidden");
  loop.start();
  document.addEventListener("visibilitychange", () => loop.setVisible(document.visibilityState !== "hidden"));
  reducedQuery.addEventListener("change", () => {
    loop.setReduced(reducedQuery.matches);
    state();
  });
  if (typeof IntersectionObserver === "function") {
    new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) {
        onScreen = last.isIntersecting;
        loop.setOnScreen(onScreen && fit);
      }
    }).observe(canvas);
  }
  if (typeof ResizeObserver === "function") new ResizeObserver(update).observe(host);
  // the copy's own size changes with the web font and the window
  addEventListener("resize", update, { passive: true });
  void document.fonts?.ready.then(update);
  return loop;
}
