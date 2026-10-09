/**
 * The mouse, for a scene that leans toward it (SITE-06: the home page's opening). Plain numbers, so the
 * rules are tested without a browser; Stage.ts listens and eases.
 *
 * - Only with a mouse or a trackpad (a fine pointer that can hover): a touch screen never moves the camera,
 *   because a finger on the page is scrolling, not pointing.
 * - Nothing moves while the mouse is near the middle of the screen (the dead zone), so reading the
 *   headline with the mouse resting on it keeps the picture still; past it the lean grows smoothly to
 *   the edge, with no step where the zone ends.
 */

/** The share of each half of the screen, from the middle, where the mouse moves nothing. */
export const DEAD_ZONE = 0.18;

/** The media query for a pointer that may lean the camera. */
export const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/** -1..1 with the dead zone taken out: 0 inside it, then rising smoothly to ±1 at the edge. */
export function deadZone(v: number, zone = DEAD_ZONE): number {
  const a = Math.min(1, Math.abs(v));
  if (a <= zone) return 0;
  const t = (a - zone) / (1 - zone);
  return Math.sign(v) * t * t * (3 - 2 * t);
}

/** A mouse position on the screen as the scene's -1..1 (x to the right, y up), dead zone applied. */
export function pointerFrom(clientX: number, clientY: number, width: number, height: number): { x: number; y: number } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  return { x: deadZone((clientX / width) * 2 - 1), y: deadZone(1 - (clientY / height) * 2) };
}
