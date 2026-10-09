/**
 * A still is one pixel per scene pixel (SITE-05): 320 x 180, the render target of a 1280 x 720 canvas
 * at 4 CSS pixels per scene pixel. It is served as it is and stretched with nearest-neighbor filtering,
 * so it is tiny and its pixels are the scene's pixels. Shared by the stills renderer and <Scene>.
 */
export const STILL_WIDTH = 320;
export const STILL_HEIGHT = 180;
/**
 * A scene that fills a whole screen (the home page's opening, SITE-06) also has tall stills, 180 x 320,
 * for a phone held upright: the same scene drawn for that shape, not a narrow slice of the wide one.
 */
export const TALL_WIDTH = STILL_HEIGHT;
export const TALL_HEIGHT = STILL_WIDTH;
