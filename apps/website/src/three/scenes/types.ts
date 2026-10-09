import type { PerspectiveCamera, Scene } from "three";
import type { PaletteUniforms } from "../palette";

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
  /**
   * A scene that moves on its own (the home page's scenes drift, spin and bob while the page is still):
   * called once a frame with the seconds since the scene started. Returns true when the picture changed,
   * so the stage draws it. Never called for a still, which is always the scene at time 0, and never
   * while reduced motion is set (the 3D does not run then at all).
   */
  tick?(seconds: number): boolean;
  /** The canvas's width / height changed. */
  resize(aspect: number): void;
  /** Frees every geometry, material and texture the scene made. */
  dispose(): void;
}

export interface SceneModule {
  /** The progress the scene's still is drawn at (the scene "at rest"). */
  readonly REST_PROGRESS: number;
  /**
   * More frames to draw stills of, by name, at these progresses (the home page's opening shows the frame
   * of the step being read where 3D does not run). scripts/stills-lib.mjs lists the same names.
   */
  readonly STILL_FRAMES?: Readonly<Record<string, number>>;
  /**
   * True for a scene that fills a whole screen: it also gets tall stills (9:16), drawn for a phone held
   * upright, so a phone never shows a narrow slice of a wide picture.
   */
  readonly TALL_STILLS?: boolean;
  create(): SceneInstance;
}
