/**
 * The 3D chunk's entry (SITE-05): the only module boot.ts imports dynamically. Everything that needs
 * Three.js or GSAP lives behind it, so none of it is in the JavaScript the page loads first.
 * Each step below ends with a yield to the main thread, so no one task is long.
 */
import { Stage } from "./Stage";
import { loadScene } from "./scenes";
import { yieldToMain } from "./yield";

/** The page is back from the back/forward cache with its stage gone: the next start may make a new one. */
export function allowRestart(): void {
  Stage.allowRestart();
}

/** Starts each host's scene on the page's one Stage. A host whose scene cannot start keeps its still. */
export async function startScenes(hosts: readonly HTMLElement[]): Promise<void> {
  const stage = Stage.get();
  if (!stage) {
    for (const host of hosts) {
      host.setAttribute("data-scene-state", "stopped");
      host.setAttribute("data-scene-reason", "no-webgl");
    }
    return;
  }
  await yieldToMain();
  for (const host of hosts) {
    const name = host.dataset["scene"];
    if (!name) continue;
    try {
      const mod = await loadScene(name);
      await yieldToMain();
      const instance = mod.create();
      await yieldToMain();
      await stage.add(name, host, instance, mod.REST_PROGRESS);
    } catch (error) {
      host.setAttribute("data-scene-state", "stopped");
      host.setAttribute("data-scene-reason", "error");
      console.error(`CuePoint 3D: scene "${name}" did not start`, error);
    }
  }
}
