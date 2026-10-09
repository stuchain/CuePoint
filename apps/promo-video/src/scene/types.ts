import type { PerspectiveCamera, Scene } from "three";
import type { PaletteUniforms } from "./palette";

/** What a scene gives the stage. The stage owns the renderer, the loop and the scroll. */
export interface SceneInstance {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** The active theme's colors changed (or are known for the first time): recolor the scene. */
  setPalette(palette: PaletteUniforms): void;
  /** Scroll progress through the scene's section, 0 to 1. Must be cheap and idempotent. */
  setProgress(progress: number): void;
  /**
   * The frame budget lowered the shadow map: `size` is its side in texels, 0 for no shadows.
   * Optional: a scene without shadows ignores it.
   */
  setShadowSize?(size: number): void;
  /** The sound the visitor switched on, 0 to 1 (home page, DEC-191). A scene that ignores sound leaves it out. */
  setLevel?(level: number): void;
  /** The canvas's width / height changed. */
  resize(aspect: number): void;
  /** Frees every geometry, material and texture the scene made. */
  dispose(): void;
}

export interface SceneModule {
  /** The progress the scene's still is drawn at (the scene "at rest"). */
  readonly REST_PROGRESS: number;
  create(): SceneInstance;
}
