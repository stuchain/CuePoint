import { useLayoutEffect, useRef, useState } from "react";
import { useMotion } from "./MotionContext";
import type { MotionKindId } from "./motion";

/** The longest an exit may hold its element when the CSS names no duration we can read. */
const EXIT_LIMIT_MS = 400;
/** Room for a late frame past the animation's own length. */
const EXIT_SLACK_MS = 120;

/** The exit's own length from its computed `animation-duration` ("80ms", "0.08s, 0.16s"), plus slack. */
export function exitLimitFor(node: HTMLElement): number {
  const list = getComputedStyle(node).animationDuration;
  const lengths = (list ?? "")
    .split(",")
    .map((part) => {
      const text = part.trim();
      const value = Number.parseFloat(text);
      if (!Number.isFinite(value)) return 0;
      return text.endsWith("ms") ? value : value * 1000;
    })
    .filter((ms) => ms > 0);
  return lengths.length > 0 ? Math.max(...lengths) + EXIT_SLACK_MS : EXIT_LIMIT_MS;
}

export interface Presence<T extends HTMLElement> {
  /** Render the element: it is open, or it is still leaving. */
  present: boolean;
  /** It was closed and is playing its exit. Mark the copy inert and non-interactive. */
  leaving: boolean;
  /** Put on the element that carries the exit animation. */
  ref: React.RefObject<T | null>;
}

/**
 * Lets a closed thing play its exit (PAGES-12) without holding a control.
 *
 * Closing flips `leaving` and keeps the element for as long as its `[data-leaving]` CSS
 * names an animation. The element must then take no input: the caller sets `inert`
 * and `pointer-events: none` on the leaving copy, so what is behind it takes the click
 * at once. With the kind off, under reduced motion, or with no animation in the CSS,
 * `leaving` never becomes visible and the element goes the moment it is closed.
 */
export function usePresence<T extends HTMLElement>(open: boolean, kind: MotionKindId = "entrance"): Presence<T> {
  const motion = useMotion(kind);
  const ref = useRef<T | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Derived during render, so the closing render already carries the leaving mark.
  if (open !== wasOpen) {
    setWasOpen(open);
    setLeaving(!open && motion);
  }

  useLayoutEffect(() => {
    if (!leaving) return;
    const node = ref.current;
    const name = node ? getComputedStyle(node).animationName : "none";
    if (!node || !name || name === "none") {
      setLeaving(false);
      return;
    }
    const done = (event?: Event) => {
      if (event && event.target !== node) return;
      setLeaving(false);
    };
    node.addEventListener("animationend", done);
    node.addEventListener("animationcancel", done);
    const timer = window.setTimeout(() => done(), exitLimitFor(node));
    return () => {
      node.removeEventListener("animationend", done);
      node.removeEventListener("animationcancel", done);
      window.clearTimeout(timer);
    };
  }, [leaving]);

  return { present: open || leaving, leaving: leaving && !open, ref };
}
