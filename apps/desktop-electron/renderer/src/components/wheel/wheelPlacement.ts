import type { WheelSource } from "./wheelStore";

/** A rectangle in window coordinates, as `getBoundingClientRect` gives it. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Room kept to the window's edges and between the popover and its opener, in CSS pixels. */
export const FIT_MARGIN = 8;

export interface Placement {
  left: number;
  top: number;
  /** The tallest the popover may be from `top` without leaving the window or covering the bar. */
  maxHeight: number;
}

/**
 * Where the Camelot wheel popover goes (round 9): next to the button that opened it, inside the
 * window. From the player bar it sits just above the bar, its left edge level with the button;
 * from Track details it sits beside the key, level with the key's top, on the left when there is
 * room (the panel is at the window's right) and otherwise on the right. With no opener known it
 * is at the window's top right.
 */
export function placeWheel(input: {
  source: WheelSource;
  anchor: Box | null;
  /** The player bar's box, for a wheel opened from it; the button's own top when unknown. */
  bar: Box | null;
  size: { width: number; height: number };
  win: { width: number; height: number };
}): Placement {
  const { source, anchor, bar, size, win } = input;
  const clampLeft = (left: number) => Math.max(Math.min(left, win.width - size.width - FIT_MARGIN), FIT_MARGIN);

  if (!anchor) {
    return { left: clampLeft(win.width), top: FIT_MARGIN, maxHeight: Math.max(win.height - 2 * FIT_MARGIN, 0) };
  }

  if (source === "player") {
    const bottom = (bar ?? anchor).top - FIT_MARGIN;
    const top = Math.max(bottom - size.height, FIT_MARGIN);
    return { left: clampLeft(anchor.left), top, maxHeight: Math.max(bottom - top, 0) };
  }

  const beside =
    anchor.left - FIT_MARGIN - size.width >= FIT_MARGIN
      ? anchor.left - FIT_MARGIN - size.width
      : anchor.right + FIT_MARGIN;
  const top = Math.max(Math.min(anchor.top, win.height - size.height - FIT_MARGIN), FIT_MARGIN);
  return { left: clampLeft(beside), top, maxHeight: Math.max(win.height - top - FIT_MARGIN, 0) };
}
