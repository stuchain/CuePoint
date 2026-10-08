import { useLayoutEffect, useRef, type RefObject } from "react";
import { useMotion } from "./MotionContext";
import type { MotionKindId } from "./motion";

/** The longest a ghost stays: --motion-base, with room for a late frame. */
const GHOST_LIMIT_MS = 400;

/**
 * Lets a thing that is simply unmounted still leave with motion (PAGES-12), without its
 * caller keeping it around: when the element goes, a still copy of it is put on the page where
 * it was, plays its `[data-ghost]` exit and is removed.
 *
 * The copy is not the app. It has no ids, is `inert` and `aria-hidden`, and takes no pointer
 * events, so a click through it lands on whatever is behind and focus never goes to it. With the
 * kind off, under reduced motion, or with no exit in the CSS, nothing is added at all.
 */
export function useLeaveGhost<T extends HTMLElement>(ref: RefObject<T | null>, kind: MotionKindId = "entrance"): void {
  const motion = useMotion(kind);
  // What the kind said at the last render. The copy is for a thing that goes while the kind is
  // on: switching the kind off with the thing still open must not leave one behind.
  const moving = useRef(motion);
  moving.current = motion;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    return () => {
      if (!moving.current || !node.isConnected) return;
      leaveAsGhost(node);
    };
  }, [ref]);
}

/** Puts the still copy where `node` is, and takes it away when its exit has played. */
export function leaveAsGhost(node: HTMLElement): HTMLElement | null {
  const rect = node.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const ghost = node.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  ghost.querySelectorAll("[tabindex]").forEach((el) => el.removeAttribute("tabindex"));
  ghost.setAttribute("data-ghost", "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
  });
  document.body.appendChild(ghost);
  const name = getComputedStyle(ghost).animationName;
  if (!name || name === "none") {
    ghost.remove();
    return null;
  }
  const done = (event?: Event) => {
    if (event && event.target !== ghost) return;
    ghost.remove();
  };
  ghost.addEventListener("animationend", done);
  ghost.addEventListener("animationcancel", done);
  window.setTimeout(() => done(), GHOST_LIMIT_MS);
  return ghost;
}
