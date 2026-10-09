/**
 * Decides when the 3D may start (SITE-05). This is the only 3D code in the first JavaScript: it is
 * small on purpose, and the 3D itself comes in through one dynamic import().
 *
 * In order:
 *  1. the cheap gate (gate.ts): no WebGL 2, reduced motion, saveData, a small device: nothing happens;
 *  2. after `load` and an idle callback: the software-GL gate (a throwaway context; SwiftShader and the
 *     like block, because there is no GPU to draw with), then the 3D chunk is fetched with
 *     <link rel=modulepreload> (fetched and parsed, not run) and `cuepoint:3d-start` is marked;
 *  3. a scene starts (the import runs, the renderer is made) only when its section is within one
 *     viewport of the screen AND the visitor has done something (wheel, touch, scroll, click, key), so
 *     an idle page never pays for the 3D; except a scene marked `data-scene-autostart` (the home page's,
 *     SITE-06), which starts as soon as it is near the screen once the page is idle: the home page's
 *     first screen is a scene that moves on its own, and fades in over its still.
 *
 * The mark is the prefetch, not the start: the scripts requested before it are the page's own, which
 * is what e2e/js-budget.spec.ts holds to 50 KB.
 */
import { PUBLIC } from "../../site.config";
import { blockers, isSoftwareRenderer, readEnv } from "./gate";
import type { StageConfig } from "./Stage";
import { yieldToMain } from "./yield";

export const START_MARK = "cuepoint:3d-start";

/** Replaced at build with the URL of the 3D entry chunk (see astro.config.ts); left as is in dev. */
const ENTRY_URL: string = "__CUEPOINT_3D_ENTRY__";

const GESTURES = ["wheel", "touchstart", "scroll", "pointerdown", "keydown"] as const;
const SELECTOR = "[data-scene]";

let gestured = false;
let loading: Promise<typeof import("./entry")> | undefined;
let observer: IntersectionObserver | undefined;
let motionWatched = false;
const queued = new Set<HTMLElement>();

const config = (): StageConfig => (PUBLIC ? {} : (window.__cuepointStageConfig ?? {}));

function setState(hosts: Iterable<HTMLElement>, state: string): void {
  for (const host of hosts) host.setAttribute("data-scene-state", state);
}

function afterLoad(fn: () => void): void {
  const go = () => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(fn, { timeout: 3000 });
    else setTimeout(fn, 200);
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}

/** True when this browser's WebGL is drawn by the CPU. A throwaway context, released at once. */
function isSoftwareGL(): boolean {
  const canvas = document.createElement("canvas");
  let gl: WebGL2RenderingContext | null = null;
  try {
    // a browser that would only give a software context refuses this one
    gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
  } catch {
    gl = null;
  }
  if (!gl) return true;
  let software = false;
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    software = isSoftwareRenderer(name);
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return software;
}

/** Fetches and parses the 3D chunk without running it, and marks the moment. */
function prefetch(): void {
  if (performance.getEntriesByName(START_MARK).length === 0) performance.mark(START_MARK);
  if (!ENTRY_URL.startsWith("/") && !ENTRY_URL.startsWith("http")) return;
  const link = document.createElement("link");
  link.rel = "modulepreload";
  link.href = ENTRY_URL;
  document.head.appendChild(link);
}

function load(): Promise<typeof import("./entry")> {
  loading ??= import("./entry");
  return loading;
}

function start(hosts: HTMLElement[]): void {
  for (const host of hosts) {
    queued.delete(host);
    observer?.unobserve(host);
  }
  load()
    .then(async (m) => {
      await yieldToMain();
      await m.startScenes(hosts);
    })
    .catch(() => setState(hosts, "still")); // the chunk did not load: the stills stay
}

/** A scene that may start before the visitor has done anything: the page asked for it (Scene's `autostart`). */
const autostarts = (host: HTMLElement): boolean => host.hasAttribute("data-scene-autostart");

function startQueued(): void {
  const ready = [...queued].filter((host) => gestured || autostarts(host));
  if (ready.length > 0) start(ready);
}

function stopListening(): void {
  for (const type of GESTURES) window.removeEventListener(type, onGesture, true);
}

function onGesture(): void {
  gestured = true;
  stopListening();
  startQueued();
}

/** Reduced motion turning on while starts are pending: they are cancelled and the stills stay. */
function watchMotion(): void {
  if (motionWatched) return;
  motionWatched = true;
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => {
    if (!event.matches) return;
    observer?.disconnect();
    stopListening();
    for (const host of document.querySelectorAll<HTMLElement>(SELECTOR)) {
      if (host.dataset["sceneState"] === "waiting") host.setAttribute("data-scene-state", "still");
    }
    queued.clear();
  });
}

export function boot(targets: HTMLElement[] = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))): void {
  if (targets.length === 0) return;
  watchMotion();
  // the cheap conditions first: nothing is loaded, no context is made, when one of them blocks
  if (blockers(readEnv()).length > 0 || typeof IntersectionObserver === "undefined") return;

  // listen from the start: a visitor who scrolls before the page is idle has still done something
  if (!gestured) for (const type of GESTURES) window.addEventListener(type, onGesture, { capture: true, passive: true });

  afterLoad(() => {
    if (!config().allowSoftwareGL && isSoftwareGL()) return stopListening(); // no GPU: the stills are the scenes
    prefetch();
    setState(targets, "waiting");
    observer ??= new IntersectionObserver(
      (records) => {
        for (const r of records) {
          if (r.isIntersecting) queued.add(r.target as HTMLElement);
          else queued.delete(r.target as HTMLElement);
        }
        startQueued();
      },
      // one viewport above and below the screen
      { rootMargin: "100% 0px 100% 0px" },
    );
    for (const host of targets) observer.observe(host);
  });
}

// Back from the back/forward cache: a context the browser took while the page was away is gone, so the
// scenes that were stopped for that reason start again (their stills are showing meanwhile).
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  const lost = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR)).filter(
    (h) => h.dataset["sceneState"] === "stopped" && h.dataset["sceneReason"] === "context-lost",
  );
  if (lost.length === 0) return;
  for (const host of lost) {
    host.removeAttribute("data-scene-reason");
    host.setAttribute("data-scene-state", "still");
  }
  void load()
    .then((m) => m.allowRestart())
    .catch(() => undefined)
    .then(() => boot(lost));
});
