import type { SceneModule } from "./types";

/**
 * Every scene, loaded on demand. A scene is a file in this folder that exports `REST_PROGRESS` and
 * `create()`; add it here and `npm run stills` renders its resting frame in each theme.
 */
export const SCENE_LOADERS = {
  cubes: () => import("./cubes"),
  opening: () => import("./opening"),
} as const satisfies Record<string, () => Promise<SceneModule>>;

export type SceneName = keyof typeof SCENE_LOADERS;

export function isSceneName(name: string): name is SceneName {
  return Object.prototype.hasOwnProperty.call(SCENE_LOADERS, name);
}

export async function loadScene(name: string): Promise<SceneModule> {
  if (!isSceneName(name)) throw new Error(`Unknown scene "${name}"`);
  return SCENE_LOADERS[name]();
}
