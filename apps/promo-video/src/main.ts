import { gsap } from "gsap";
import "./style.css";
import { formatFrom, FORMATS } from "./formats";
import { createOpeningShot } from "./opening3d";
import { buildShots } from "./shots";
import { createBackdrop } from "./backdrop";
import { HUES } from "./content";
import { DURATION, FPS, FRAMES, shot } from "./timing";

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
  const { sceneHost, backdropHost } = buildShots(stage, format, tl);
  // the phone cut frames the opening in a squarer box above the captions, so the crate stays in shot;
  // the end card has no caption, so there the wheel fills the whole frame
  interface View {
    width: number;
    height: number;
    top: number;
  }
  const full: View = { width, height, top: 0 };
  const box: View = format === "tall" ? { width, height: 1380, top: 130 } : full;
  const scene = createOpeningShot(box.width, box.height);
  let current: View | undefined;
  const useView = (view: View): void => {
    if (view === current) return;
    current = view;
    scene.resize(view.width, view.height);
    Object.assign(scene.canvas.style, { top: `${view.top}px`, height: `${view.height}px`, bottom: "auto" });
  };
  useView(box);
  sceneHost.append(scene.canvas);
  const backdrop = createBackdrop(width, height, HUES);
  backdropHost.append(backdrop.canvas);
  tl.set({}, {}, DURATION); // the timeline is exactly as long as the video

  await document.fonts.ready;
  await Promise.all([...stage.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
  await scene.compile();

  const seek = (t: number): void => {
    tl.seek(t, false);
    if (t < shot("opening").end) {
      useView(box);
      scene.draw(t);
    } else if (t >= shot("end").start) {
      useView(full);
      scene.draw(t);
    } else backdrop.draw(t);
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
