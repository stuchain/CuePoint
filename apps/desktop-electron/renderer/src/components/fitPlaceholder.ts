/**
 * A search box too narrow for its full hint says "Search…" (R7-20), so the hint is never cut
 * mid-word ("Search these tra"). The accessible name is the label and does not change.
 */
import { useLayoutEffect, type RefObject } from "react";

export const SHORT_PLACEHOLDER = "Search…";

/**
 * The hint that fits. No layout (a test DOM, a box not yet drawn: `room` of 0 or less) reads as
 * "fits", so the full hint stays.
 */
export function placeholderFor(full: string, fullWidth: number, room: number): string {
  if (room <= 0 || fullWidth <= room) return full;
  return SHORT_PLACEHOLDER;
}

/** Keeps the input's placeholder to the full hint while it fits, and "Search…" when it does not. */
export function useFitPlaceholder(input: RefObject<HTMLInputElement | null>, full: string, enabled = true) {
  useLayoutEffect(() => {
    const box = input.current;
    if (!enabled || !box || typeof ResizeObserver === "undefined") return;
    let canvas: CanvasRenderingContext2D | null | undefined;
    const measure = () => {
      // No layout (a test DOM, a box not yet drawn): nothing to measure, the full hint stays.
      if (box.clientWidth <= 0) return;
      canvas ??= document.createElement("canvas").getContext("2d");
      const style = getComputedStyle(box);
      const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
      let width = 0;
      if (canvas) {
        canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        width = canvas.measureText(full).width;
      }
      box.placeholder = placeholderFor(full, width, box.clientWidth - padding);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    // The first measure may run before the web font has loaded; measure again once it has.
    let live = true;
    void document.fonts?.ready?.then(() => {
      if (live) {
        canvas = undefined;
        measure();
      }
    });
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [input, full, enabled]);
}
