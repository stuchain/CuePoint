/**
 * The start gate (SITE-05): pure functions that decide whether a scene may start, and the frame-rate
 * probe that stops it again. No Three.js and no DOM at import time, so this is cheap to ship in the
 * first bundle and easy to test.
 *
 * Why each condition blocks the 3D (the still stays the scene in every case):
 *   no-webgl2       the renderer cannot exist
 *   reduced-motion  the visitor asked for less movement
 *   save-data       the visitor asked for less data; a 3D chunk is hundreds of KB
 *   low-memory      navigator.deviceMemory < 4 (GB)
 *   few-cores       navigator.hardwareConcurrency < 4
 *   software-gl     the context is made by a software renderer (SwiftShader, llvmpipe, ...): no GPU, so no 3D
 */

export interface GateEnv {
  /** WebGL2RenderingContext exists. Whether a context can really be made is learned when the renderer is built. */
  webgl2: boolean;
  reducedMotion: boolean;
  saveData: boolean;
  /** navigator.deviceMemory in GB; undefined where the browser does not report it. */
  deviceMemory?: number | undefined;
  hardwareConcurrency?: number | undefined;
  /** True when the WebGL renderer is software (see isSoftwareRenderer); leave out before it is probed. */
  softwareGL?: boolean | undefined;
}

export type GateBlock = "no-webgl2" | "reduced-motion" | "save-data" | "low-memory" | "few-cores" | "software-gl";

export const MIN_DEVICE_MEMORY = 4;
/**
 * Load-bearing for Safari: WebKit does not report the real core count, it buckets hardwareConcurrency
 * to 4 or 8 (and reports no deviceMemory at all). A floor of 4 therefore lets every Safari through
 * and blocks only browsers that report fewer. Raising it would block all of Safari; lowering it
 * changes nothing there.
 */
export const MIN_CORES = 4;
/** The first two seconds of rendering are measured; below this many frames per second the scene stops. */
export const PROBE_MS = 2000;
export const MIN_FPS = 30;

/** Every reason the 3D must not start; empty when it may. */
export function blockers(env: GateEnv): GateBlock[] {
  const out: GateBlock[] = [];
  if (!env.webgl2) out.push("no-webgl2");
  if (env.reducedMotion) out.push("reduced-motion");
  if (env.saveData) out.push("save-data");
  if (env.deviceMemory !== undefined && env.deviceMemory < MIN_DEVICE_MEMORY) out.push("low-memory");
  if (env.hardwareConcurrency !== undefined && env.hardwareConcurrency < MIN_CORES) out.push("few-cores");
  if (env.softwareGL === true) out.push("software-gl");
  return out;
}

/** The renderer names of software WebGL: no GPU behind the canvas. */
export function isSoftwareRenderer(name: string): boolean {
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(name);
}

export function canStart(env: GateEnv): boolean {
  return blockers(env).length === 0;
}

interface EnvWindow {
  matchMedia(query: string): { matches: boolean };
  navigator: {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
  WebGL2RenderingContext?: unknown;
}

/** Reads the browser's signals into a GateEnv. */
export function readEnv(win: EnvWindow = window as unknown as EnvWindow): GateEnv {
  const nav = win.navigator;
  return {
    webgl2: typeof win.WebGL2RenderingContext !== "undefined",
    reducedMotion: win.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: nav.connection?.saveData === true,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  };
}

export type ProbeVerdict = "pending" | "pass" | "fail";

/** After this long a clearly slow scene is stopped without waiting for the full probe. */
export const EARLY_MS = 500;
export const EARLY_FPS = 20;
/** Three frames in a row further apart than this (about 15 fps) also stop it early. */
export const LONG_FRAME_MS = 66;
export const LONG_FRAMES = 3;

/**
 * Counts rendered frames for PROBE_MS and says whether they ran at MIN_FPS or better. It aborts early
 * (after EARLY_MS) below EARLY_FPS, or after LONG_FRAMES consecutive frames longer than LONG_FRAME_MS.
 * A gap between two frames longer than GAP_MS (a hidden tab, a scene that was off screen) restarts the
 * count: the probe judges rendering, not waiting. A lowered `minFps` (preview tests on a busy machine)
 * lowers the early floor with it and turns the long-frame rule off.
 */
export class FpsProbe {
  static readonly GAP_MS = 1000;
  private startAt = 0;
  private frames = 0;
  private last = 0;
  private longRun = 0;
  private result: ProbeVerdict = "pending";
  private readonly earlyFps: number;
  private readonly longFrameRule: boolean;

  constructor(private readonly minFps: number = MIN_FPS) {
    this.earlyFps = Math.min(EARLY_FPS, minFps);
    this.longFrameRule = minFps >= MIN_FPS;
  }

  start(now: number): void {
    this.startAt = now;
    this.last = now;
    this.frames = 0;
    this.longRun = 0;
    this.result = "pending";
  }

  /** Call once per rendered frame with the frame's timestamp (ms). */
  frame(now: number): ProbeVerdict {
    if (this.result !== "pending") return this.result;
    const gap = now - this.last;
    if (gap > FpsProbe.GAP_MS) {
      this.start(now);
      return "pending";
    }
    this.longRun = gap > LONG_FRAME_MS ? this.longRun + 1 : 0;
    this.last = now;
    this.frames += 1;
    const elapsed = now - this.startAt;
    const fps = this.frames / (elapsed / 1000);
    if (this.longFrameRule && this.longRun >= LONG_FRAMES) this.result = "fail";
    else if (elapsed >= EARLY_MS && fps < this.earlyFps) this.result = "fail";
    else if (elapsed >= PROBE_MS) this.result = fps >= this.minFps ? "pass" : "fail";
    return this.result;
  }

  verdict(): ProbeVerdict {
    return this.result;
  }
}
