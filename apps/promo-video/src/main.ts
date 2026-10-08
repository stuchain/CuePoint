import { gsap } from "gsap";
import "./style.css";
import { formatFrom, FORMATS } from "./formats";
import { createOpeningShot } from "./opening3d";
import { buildShots } from "./shots";
import { createBackdrop } from "./backdrop";
import { HUES } from "./content";
import { DURATION, FPS, FRAMES, KICKS, kickLevel, shot, snareLevel } from "./timing";

/** The camera shake: a few pixels on every kick, a small zoom punch on the snare. Pure in t. */
function shake(world: HTMLElement, t: number): void {
  const k = kickLevel(t);
  const n = KICKS.findLastIndex((x) => x <= t + 1e-9);
  const dx = Math.round(Math.sin(n * 12.9898) * 10 * k);
  const dy = Math.round(Math.cos(n * 78.233) * 8 * k);
  const z = 1 + 0.025 * k + 0.02 * snareLevel(t);
  world.style.transform = `translate(${dx}px, ${dy}px) scale(${z.toFixed(4)})`;
}

/**
 * The promo as one paused GSAP timeline plus the website's 3D opening, both a pure function of time.
 * `scripts/render.mjs` calls window.__promo.seek(t) frame by frame and screenshots the stage; opening
 * the page in a browser (`npm run dev`) plays it live.
 */

declare global {
  interface Window {
    __promo?: { fps: number; frames: number; duration: number; seek(t: number): void };
  }
}

async function main(): Promise<void> {
  const format = formatFrom(location.search);
  const { width, height } = FORMATS[format];
  const stage = document.getElementById("stage")!;
  stage.classList.add(format);
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;

  gsap.ticker.lagSmoothing(0);
  const tl = gsap.timeline({ paused: true });
  const { sceneHost, backdropHost, world } = buildShots(stage, format, tl);
  // the phone cut frames the 3D in a squarer box above the captions, so the crate stays in shot
  const view = format === "tall" ? { width, height: 1380, top: 130 } : { width, height, top: 0 };
  const scene = createOpeningShot(view.width, view.height);
  Object.assign(scene.canvas.style, { top: `${view.top}px`, height: `${view.height}px`, bottom: "auto" });
  sceneHost.append(scene.canvas);
  const backdrop = createBackdrop(width, height, HUES);
  backdropHost.append(backdrop.canvas);
  tl.set({}, {}, DURATION); // the timeline is exactly as long as the video

  await document.fonts.ready;
  await Promise.all([...stage.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
  await scene.compile();

  const seek = (t: number): void => {
    tl.seek(t, false);
    if (t < shot("opening").end || t >= shot("end").start) scene.draw(t);
    else backdrop.draw(t);
    shake(world, t);
  };
  seek(0);
  window.__promo = { fps: FPS, frames: FRAMES, duration: DURATION, seek };
  document.documentElement.dataset["ready"] = "1";

  if (!new URLSearchParams(location.search).has("render")) {
    // live preview: loop in real time
    const t0 = performance.now();
    const loop = (): void => {
      seek(((performance.now() - t0) / 1000) % DURATION);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

main().catch((error) => {
  document.documentElement.dataset["error"] = String(error);
  throw error;
});
