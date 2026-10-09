import { PIXEL_SIZE, PixelPipeline } from "./pixel";
import { readPalette } from "./palette";
import { createRenderer, releaseContext } from "./renderer";
import { loadScene } from "./scenes";
import { STILL_HEIGHT, STILL_WIDTH, TALL_HEIGHT, TALL_WIDTH } from "./still-size";

/**
 * Renders one scene's still to a PNG data URL, in the theme the page currently shows.
 * `npm run stills` calls this on /styleguide/stills/ in headless Chromium, once per scene, frame, shape
 * and theme. It uses the same pipeline as the live stage (pixel target, palette snap, outline, hard
 * shadows), with the canvas the size of the render target: one still pixel per scene pixel.
 *
 * `frame` names one of the scene's STILL_FRAMES (left out: the resting frame); `tall` draws the 9:16
 * still of a scene with TALL_STILLS. A still is the scene at time 0: no motion over time is in it.
 */

export interface StillOptions {
  frame?: string;
  tall?: boolean;
}

export async function renderStill(name: string, options: StillOptions = {}): Promise<string> {
  const canvas = document.createElement("canvas");
  const renderer = createRenderer(canvas);
  if (!renderer) throw new Error("WebGL 2 is not available in this browser");
  const pixel = new PixelPipeline();
  const mod = await loadScene(name);
  const progress = options.frame === undefined ? mod.REST_PROGRESS : mod.STILL_FRAMES?.[options.frame];
  if (progress === undefined) throw new Error(`Scene "${name}" has no still frame "${options.frame}"`);
  if (options.tall && !mod.TALL_STILLS) throw new Error(`Scene "${name}" has no tall stills`);
  const [width, height] = options.tall ? [TALL_WIDTH, TALL_HEIGHT] : [STILL_WIDTH, STILL_HEIGHT];
  const instance = mod.create();
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    pixel.resize(width * PIXEL_SIZE, height * PIXEL_SIZE);
    const palette = readPalette();
    pixel.setPalette(palette);
    instance.setPalette(palette);
    instance.resize(width / height);
    instance.setProgress(progress);
    await renderer.compileAsync(instance.scene, instance.camera);
    pixel.render(renderer, instance.scene, instance.camera);
    // read in the same task as the draw: the drawing buffer is not preserved
    return canvas.toDataURL("image/png");
  } finally {
    instance.dispose();
    pixel.dispose();
    releaseContext(renderer);
  }
}
