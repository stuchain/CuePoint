import { PIXEL_SIZE, PixelPipeline } from "./pixel";
import { readPalette } from "./palette";
import { createRenderer, releaseContext } from "./renderer";
import { loadScene } from "./scenes";
import { STILL_HEIGHT, STILL_WIDTH } from "./still-size";

/**
 * Renders one scene's resting frame to a PNG data URL, in the theme the page currently shows.
 * `npm run stills` calls this on /styleguide/stills/ in headless Chromium, once per scene and theme.
 * It uses the same pipeline as the live stage (pixel target, palette snap, outline, hard shadows),
 * with the canvas the size of the render target: one still pixel per scene pixel.
 */

export async function renderStill(name: string): Promise<string> {
  const canvas = document.createElement("canvas");
  const renderer = createRenderer(canvas);
  if (!renderer) throw new Error("WebGL 2 is not available in this browser");
  const pixel = new PixelPipeline();
  const mod = await loadScene(name);
  const instance = mod.create();
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(STILL_WIDTH, STILL_HEIGHT, false);
    pixel.resize(STILL_WIDTH * PIXEL_SIZE, STILL_HEIGHT * PIXEL_SIZE);
    const palette = readPalette();
    pixel.setPalette(palette);
    instance.setPalette(palette);
    instance.resize(STILL_WIDTH / STILL_HEIGHT);
    instance.setProgress(mod.REST_PROGRESS);
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
