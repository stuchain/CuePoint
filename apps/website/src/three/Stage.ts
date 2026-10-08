import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { WebGLRenderer } from "three";
import { PUBLIC } from "../../site.config";
import { THEME_EVENT } from "../lib/themes";
import { FrameBudget } from "./budget";
import { FpsProbe } from "./gate";
import { PixelPipeline } from "./pixel";
import { readPalette, type PaletteUniforms } from "./palette";
import { createRenderer, releaseContext } from "./renderer";
import type { SceneInstance } from "./scenes/types";
import { yieldToMain } from "./yield";

/**
 * The Stage (SITE-05): one WebGL renderer per page, reused by every scene on it.
 *
 * - It owns one canvas and moves it into whichever scene is most on screen; the others show their stills.
 * - A scene's progress comes from a GSAP ScrollTrigger with `scrub`; the loop runs only while a scene
 *   is on screen and the tab is visible, and renders only when something changed (and every frame
 *   during the frame-rate probe). When the canvas first mounts, the progress eases from the still's
 *   resting frame to the scrub value, so there is no pop.
 * - The renderer draws to a small nearest-neighbor target; PixelPipeline snaps colors to the theme. The
 *   canvas backbuffer is a whole number of device pixels per scene pixel.
 * - The frame budget steps the quality down while frames run long (budget.ts).
 * - Setup is done in small steps with a yield between them (yield.ts).
 * - `pagehide` that is not entering the back/forward cache disposes everything and releases the WebGL
 *   context with WEBGL_lose_context; one that is entering it only sleeps, and `pageshow` wakes it.
 * - prefers-reduced-motion turning on stops the stage.
 */

gsap.registerPlugin(ScrollTrigger);

export type StageStatus = "running" | "sleeping" | "stopped" | "disposed";

/** What the preview builds expose as `window.__cuepointStage`, for the e2e checks only. */
export interface StageDebug {
  status: StageStatus;
  /** Why the stage stopped: "slow", "context-lost", "reduced-motion", "pagehide". */
  reason: string | undefined;
  contextLost: boolean;
  frames: number;
  dpr: number;
  /** CSS pixels per scene pixel, and the shadow map side (0 is off), as the frame budget has them. */
  pixelSize: number;
  shadowSize: number;
  scenes: string[];
}

/** Preview builds only: what the e2e checks may change. Read when the Stage or the gate needs it. */
export interface StageConfig {
  /** A lower frame-rate floor, so a busy test machine does not stop the scene. */
  minFps?: number;
  /** Let software WebGL (SwiftShader) start the 3D. */
  allowSoftwareGL?: boolean;
}

declare global {
  interface Window {
    __cuepointStage?: StageDebug;
    __cuepointStageConfig?: StageConfig;
  }
}

/** sessionStorage key a preview build sets when the context is released, so a test can read it after leaving. */
export const RELEASED_KEY = "cuepoint:stage-released";

/** How long the canvas takes to ease from the still's frame to the scrolled one. */
const INTRO_SECONDS = 0.6;

interface Entry {
  name: string;
  host: HTMLElement;
  layer: HTMLElement;
  instance: SceneInstance;
  ready: Promise<void>;
  ratio: number;
  /** The still's frame. */
  rest: number;
  /** The scrub's value, 0 to 1. */
  progress: { p: number };
  /** 0 until the canvas first mounts, then eased to 1: how far the shown progress has moved from rest. */
  intro: { mix: number };
  tween: gsap.core.Tween;
  /** Pushes the shown progress (rest eased toward the scrub value) into the scene. */
  show: () => void;
  observer: IntersectionObserver;
}

const idle = (fn: () => void): void => {
  if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 1500 });
  else setTimeout(fn, 120);
};

let current: Stage | null | undefined;

export class Stage {
  /** The page's one stage; null when WebGL 2 could not be had. Created on first call. */
  static get(): Stage | null {
    if (current === undefined) current = Stage.make();
    return current;
  }

  /**
   * A stage that stopped stays stopped: later scenes on the page do not start a new one. Only coming back
   * from the back/forward cache with a lost context (boot.ts) makes a fresh stage allowed.
   */
  static allowRestart(): void {
    if (current === null) current = undefined;
  }

  private static make(): Stage | null {
    const canvas = document.createElement("canvas");
    const renderer = createRenderer(canvas);
    return renderer ? new Stage(canvas, renderer) : null;
  }

  readonly debug: StageDebug = {
    status: "running",
    reason: undefined,
    contextLost: false,
    frames: 0,
    dpr: 1,
    pixelSize: 4,
    shadowSize: 1024,
    scenes: [],
  };

  private readonly pixel = new PixelPipeline();
  private readonly budget = new FrameBudget(window.devicePixelRatio || 1);
  // preview builds let the e2e checks lower the floor, so a busy test machine does not stop the scene
  private readonly probe = new FpsProbe(PUBLIC ? undefined : window.__cuepointStageConfig?.minFps);
  private readonly entries = new Map<HTMLElement, Entry>();
  private readonly motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private palette: PaletteUniforms;
  private active: Entry | undefined;
  private resizeObserver: ResizeObserver;
  private ticking = false;
  private dirty = true;
  private lastTick = 0;
  private lastRender = 0;
  private appliedShadow: number;
  private disposed = false;
  private released = false;
  private asleep = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: WebGLRenderer,
  ) {
    canvas.setAttribute("aria-hidden", "true");
    canvas.setAttribute("data-scene-canvas", "");
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.palette = readPalette();
    this.pixel.setPalette(this.palette);
    this.appliedShadow = this.budget.shadowSize;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    document.addEventListener(THEME_EVENT, this.onTheme);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.onPageShow);
    this.motion.addEventListener("change", this.onMotion);
    this.syncDebug();
    this.publish();
  }

  /**
   * Adds a scene to the page. Its stills stay under the canvas, which is moved in when it is on screen.
   * `rest` is the progress the still shows. Resolves when the scene's shaders are compiled.
   */
  async add(name: string, host: HTMLElement, instance: SceneInstance, rest: number): Promise<void> {
    if (this.disposed || this.entries.has(host)) return;
    const layer = host.querySelector<HTMLElement>("[data-scene-layer]");
    if (!layer) throw new Error(`Scene "${name}" has no [data-scene-layer]`);
    instance.setPalette(this.palette);
    instance.setShadowSize?.(this.budget.shadowSize);

    // ScrollTrigger with scrub: the progress follows the scroll and stops when it stops
    const progress = { p: 0 };
    const intro = { mix: 0 };
    const show = () => {
      instance.setProgress(rest + (progress.p - rest) * intro.mix);
      this.dirty = true;
    };
    const tween = gsap.to(progress, {
      p: 1,
      ease: "none",
      scrollTrigger: { trigger: host, start: "top bottom", end: "bottom top", scrub: true },
      onUpdate: show,
    });
    instance.setProgress(rest);

    const entry: Entry = {
      name,
      host,
      layer,
      instance,
      ratio: 0,
      rest,
      progress,
      intro,
      tween,
      show,
      // compile the scene's shaders while the browser is idle, one step at a time, before its section is reached
      ready: Promise.resolve(),
      observer: new IntersectionObserver(
        (records) => {
          for (const r of records) entry.ratio = r.isIntersecting ? r.intersectionRatio : 0;
          this.pick();
        },
        { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
      ),
    };
    entry.ready = new Promise<void>((resolve) =>
      idle(() => {
        void (async () => {
          try {
            this.pixel.compile(this.renderer);
            await yieldToMain();
            await this.renderer.compileAsync(instance.scene, instance.camera);
          } catch {
            /* a failed precompile only means the first frame compiles instead */
          }
          resolve();
        })();
      }),
    );
    this.entries.set(host, entry);
    this.debug.scenes = [...this.entries.values()].map((e) => e.name);
    this.publish();
    entry.observer.observe(host);
    await entry.ready;
  }

  // ---- which scene has the canvas ----

  private pick(): void {
    let best: Entry | undefined;
    for (const e of this.entries.values()) if (e.ratio > 0 && (!best || e.ratio > best.ratio)) best = e;
    if (best === this.active) return;
    const next = best;
    this.active = next;
    if (!next) {
      this.sleep();
      return;
    }
    void next.ready
      .then(() => yieldToMain())
      .then(() => {
        if (this.disposed || this.active !== next) return;
        this.mount(next);
      });
  }

  private mount(entry: Entry): void {
    entry.layer.appendChild(this.canvas);
    this.resizeObserver.disconnect();
    this.resizeObserver.observe(entry.layer);
    this.resize();
    entry.host.setAttribute("data-scene-state", "running");
    this.probe.start(performance.now());
    this.wake();
    if (entry.intro.mix === 0) {
      // no pop: the first canvas frame is the still's, then it eases to where the scroll is
      gsap.to(entry.intro, {
        mix: 1,
        duration: INTRO_SECONDS,
        ease: "power2.out",
        onUpdate: entry.show,
        onComplete: entry.show,
      });
    }
  }

  private resize(): void {
    const entry = this.active;
    if (!entry || this.disposed) return;
    const w = Math.max(1, entry.layer.clientWidth);
    const h = Math.max(1, entry.layer.clientHeight);
    const size = this.pixel.resize(w, h, this.budget.pixelSize);
    // a whole number of device pixels per scene pixel
    const scale = this.budget.backbufferScale;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size.width * scale, size.height * scale, false);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    entry.instance.resize(w / h);
    this.syncDebug();
    this.dirty = true;
    this.draw(); // draw now, so the canvas never shows a blank frame over the still
  }

  private applyBudget(): void {
    if (this.budget.shadowSize !== this.appliedShadow) {
      this.appliedShadow = this.budget.shadowSize;
      for (const e of this.entries.values()) e.instance.setShadowSize?.(this.appliedShadow);
    }
    this.resize();
  }

  private syncDebug(): void {
    this.debug.dpr = this.budget.dpr;
    this.debug.pixelSize = this.budget.pixelSize;
    this.debug.shadowSize = this.budget.shadowSize;
  }

  // ---- the loop ----

  private wake(): void {
    if (this.ticking || this.disposed || this.asleep || !this.active || document.hidden) return;
    this.ticking = true;
    this.lastTick = performance.now();
    gsap.ticker.add(this.tick);
  }

  private sleep(): void {
    if (!this.ticking) return;
    this.ticking = false;
    gsap.ticker.remove(this.tick);
  }

  private readonly tick = (): void => {
    if (this.disposed || !this.active) return;
    const now = performance.now();
    const since = now - this.lastTick; // the interval between animation frames, see FrameBudget.frame
    this.lastTick = now;
    const probing = this.probe.verdict() === "pending";
    if (!this.dirty && !probing) return;
    // frame times mean something only when frames follow each other
    if (now - this.lastRender < 250 && this.budget.frame(since)) this.applyBudget();
    this.lastRender = now;
    this.draw();
    if (probing && this.probe.frame(now) === "fail") this.stop("slow");
    else if (probing) this.dirty = true;
  };

  private draw(): void {
    const entry = this.active;
    if (!entry || this.disposed || this.renderer.getContext().isContextLost()) return;
    this.pixel.render(this.renderer, entry.instance.scene, entry.instance.camera);
    this.dirty = false;
    this.debug.frames += 1;
  }

  // ---- events ----

  private readonly onTheme = (): void => {
    if (this.disposed) return;
    this.palette = readPalette();
    this.pixel.setPalette(this.palette);
    for (const e of this.entries.values()) e.instance.setPalette(this.palette);
    this.dirty = true;
    this.draw();
  };

  private readonly onVisibility = (): void => {
    if (document.hidden) this.sleep();
    else {
      this.probe.start(performance.now());
      this.wake();
    }
  };

  private readonly onMotion = (): void => {
    if (this.motion.matches) this.stop("reduced-motion");
  };

  private readonly onContextLost = (e: Event): void => {
    this.debug.contextLost = true;
    this.publish();
    if (!this.released) {
      e.preventDefault();
      this.stop("context-lost");
    }
  };

  /** Entering the back/forward cache: only sleep, so coming back is instant. Otherwise the page is leaving for good. */
  private readonly onPageHide = (e: PageTransitionEvent): void => {
    if (e.persisted) {
      this.asleep = true;
      this.sleep();
      this.debug.status = "sleeping";
      this.publish();
    } else this.dispose("pagehide");
  };

  private readonly onPageShow = (e: PageTransitionEvent): void => {
    if (!e.persisted || this.disposed || !this.asleep) return;
    this.asleep = false;
    this.debug.status = "running";
    this.probe.start(performance.now());
    this.dirty = true;
    this.wake();
    this.publish();
  };

  // ---- ending ----

  /** Back to the stills: the canvas is removed and the context released, the page keeps working. */
  stop(reason: string): void {
    this.dispose(reason, "stopped");
  }

  dispose(reason = "dispose", status: StageStatus = "disposed"): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sleep();
    document.removeEventListener(THEME_EVENT, this.onTheme);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("pageshow", this.onPageShow);
    this.motion.removeEventListener("change", this.onMotion);
    this.resizeObserver.disconnect();
    for (const e of this.entries.values()) {
      e.observer.disconnect();
      gsap.killTweensOf(e.intro);
      e.tween.scrollTrigger?.kill();
      e.tween.kill();
      e.instance.dispose();
      e.host.setAttribute("data-scene-state", "stopped");
      e.host.setAttribute("data-scene-reason", reason);
    }
    this.entries.clear();
    this.active = undefined;
    this.canvas.remove();
    this.pixel.dispose();
    this.released = true;
    releaseContext(this.renderer);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.debug.status = status;
    this.debug.reason = reason;
    this.debug.contextLost = true;
    this.debug.scenes = [];
    this.publish();
    if (current === this) current = null;
  }

  private publish(): void {
    if (PUBLIC) return; // the debug hook exists in preview builds only
    window.__cuepointStage = this.debug;
    try {
      if (this.debug.contextLost) sessionStorage.setItem(RELEASED_KEY, "1");
      else sessionStorage.removeItem(RELEASED_KEY);
    } catch {
      /* storage blocked: the window hook still works */
    }
  }
}
