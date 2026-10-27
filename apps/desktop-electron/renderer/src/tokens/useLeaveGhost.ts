import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useMotion } from "./MotionContext";
import type { MotionKindId } from "./motion";

/** The longest a ghost stays: --motion-base, with room for a late frame. */
const GHOST_LIMIT_MS = 400;

/** Where a box is, as the ghost needs it. */
export interface GhostRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Lets a thing that is simply unmounted still leave with motion (PAGES-12), without its
 * caller keeping it around: when the element goes, a still copy of it is put on the page where
 * it was, plays its `[data-ghost]` exit and is removed.
 *
 * The copy is not the app. It has no ids, is `inert` and `aria-hidden`, and takes no pointer
 * events, so a click through it lands on whatever is behind and focus never goes to it. With the
 * kind off, under reduced motion, or with no exit in the CSS, nothing is added at all.
 *
 * Nothing is measured while the thing is unmounted: that runs inside React's commit, where a
 * measurement forces a layout of a page that is still changing. Where it is is read in a frame
 * callback after each render instead, just before the browser lays the frame out anyway.
 */
export function useLeaveGhost<T extends HTMLElement>(ref: RefObject<T | null>, kind: MotionKindId = "entrance"): void {
  const motion = useMotion(kind);
  // What the kind said at the last render. The copy is for a thing that goes while the kind is
  // on: switching the kind off with the thing still open must not leave one behind.
  const moving = useRef(motion);
  moving.current = motion;
  const box = useRef<GhostRect | null>(null);

  // After every render: the thing may have moved (a menu places itself once it knows its size).
  useEffect(() => {
    if (!moving.current) return undefined;
    const frame = requestAnimationFrame(() => {
      const node = ref.current;
      if (node?.isConnected) box.current = node.getBoundingClientRect();
    });
    return () => cancelAnimationFrame(frame);
  });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    return () => {
      if (!moving.current || !node.isConnected || !box.current) return;
      leaveAsGhost(node, { kind, rect: box.current });
    };
  }, [ref, kind]);
}

interface LeaveOptions {
  /** The kind whose exit plays; the copy is made only while `:root` carries its attribute. */
  kind?: MotionKindId;
  /** Where the node is, measured earlier. Without it the node is measured now. */
  rect?: GhostRect;
}

/** Puts the still copy where `node` is, and takes it away when its exit has played. */
export function leaveAsGhost(node: HTMLElement, { kind = "entrance", rect }: LeaveOptions = {}): HTMLElement | null {
  // The provider writes the attribute only while the kind is on and motion is not reduced, and
  // every [data-ghost] exit sits behind it: reading it costs no style, where asking the copy for
  // its computed animation forced a style pass over the whole copy.
  if (!document.documentElement.hasAttribute(`data-motion-${kind}`)) return null;
  const box = rect ?? node.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return null;
  const ghost = node.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  ghost.querySelectorAll("[tabindex]").forEach((el) => el.removeAttribute("tabindex"));
  copyCanvases(node, ghost);
  ghost.setAttribute("data-ghost", "");
  // The copy is the thing leaving (M380): `[data-leaving]` exits apply to it, and a copy of a menu
  // that opened above (`data-placement="top"`) sinks out the way it rose in.
  ghost.setAttribute("data-leaving", "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: "0",
  });
  document.body.appendChild(ghost);
  const done = (event?: Event) => {
    if (event && event.target !== ghost) return;
    ghost.remove();
  };
  ghost.addEventListener("animationend", done);
  ghost.addEventListener("animationcancel", done);
  window.setTimeout(() => done(), GHOST_LIMIT_MS);
  return ghost;
}

/** A cloned canvas is blank: each one is drawn again from the one it was copied from. */
function copyCanvases(from: HTMLElement, to: HTMLElement): void {
  const sources = from.querySelectorAll("canvas");
  if (sources.length === 0) return;
  const copies = to.querySelectorAll("canvas");
  sources.forEach((source, index) => {
    const copy = copies[index];
    if (!copy || source.width === 0 || source.height === 0) return;
    copy.width = source.width;
    copy.height = source.height;
    try {
      copy.getContext("2d")?.drawImage(source, 0, 0);
    } catch {
      // A canvas that cannot be read (or a test without one) leaves the copy blank, as before.
    }
  });
}
