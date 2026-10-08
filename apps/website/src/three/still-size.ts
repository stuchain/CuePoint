/**
 * A still is one pixel per scene pixel (SITE-05): 320 x 180, the render target of a 1280 x 720 canvas
 * at 4 CSS pixels per scene pixel. It is served as it is and stretched with nearest-neighbor filtering,
 * so it is tiny and its pixels are the scene's pixels. Shared by the stills renderer and <Scene>.
 */
export const STILL_WIDTH = 320;
export const STILL_HEIGHT = 180;
