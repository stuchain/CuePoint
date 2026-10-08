import { gsap } from "gsap";
import "./style.css";
import { formatFrom, FORMATS } from "./formats";
import { createOpeningShot } from "./opening3d";
import { buildShots } from "./shots";
import { DURATION, FPS, FRAMES } from "./timing";

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
  const { openingHost } = buildShots(stage, format, tl);
  // the phone cut frames the 3D in a squarer box above the captions, so the crate stays in shot
  const view = format === "tall" ? { width, height: 1380, top: 130 } : { width, height, top: 0 };
  const opening = createOpeningShot(view.width, view.height);
  Object.assign(opening.canvas.style, { top: `${view.top}px`, height: `${view.height}px`, bottom: "auto" });
  openingHost.append(opening.canvas);
  tl.set({}, {}, DURATION); // the timeline is exactly as long as the video

  await document.fonts.ready;
  await Promise.all([...stage.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
  await opening.compile();

  const seek = (t: number): void => {
    tl.seek(t, false);
    if (t < 9.6) opening.draw(t);
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
