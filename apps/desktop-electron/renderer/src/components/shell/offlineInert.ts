/**
 * Offline, the page stops answering (M363, M364, D31): its content is made `inert`, so no control
 * takes a press, a key, hover or the hand cursor, and nothing in it can be tabbed to or focused.
 * One rule instead of a list of what is pressable (radios, selects, sliders and fields used to
 * keep working and fail into a toast each).
 *
 * A dialog opened from the page is drawn inside it, so it is the one thing that must stay live:
 * it is how a person closes what they were in. The walk marks every child that is neither a
 * dialog nor holds one, and goes on inside those that hold one. The region itself is never inert,
 * so it still scrolls. An element marked `data-offline-ok` is left alone, for the rare control
 * that works without the engine (a copy button).
 */

/** Dialogs rendered inside the page (the modal is not portaled) stay usable offline. */
export const DIALOGS = '[role="dialog"], [role="alertdialog"]';

/** What a control that works offline carries. */
export const OFFLINE_OK = "[data-offline-ok]";

/**
 * Set `inert` on what is inside `region` except dialogs, the elements that hold them and anything
 * marked offline-ok. Returns what it marked, so the caller can take it off again.
 */
export function markInert(region: Element, marked: Set<Element> = new Set()): Set<Element> {
  for (const child of Array.from(region.children)) {
    if (child.matches(DIALOGS) || child.matches(OFFLINE_OK)) continue;
    if (child.querySelector(DIALOGS) !== null) {
      markInert(child, marked);
    } else if (!child.hasAttribute("inert")) {
      child.setAttribute("inert", "");
      marked.add(child);
    }
  }
  return marked;
}

/** Take `inert` off what `markInert` set, wherever those elements are now. */
export function clearInert(marked: Set<Element>): void {
  for (const element of marked) element.removeAttribute("inert");
  marked.clear();
}

/**
 * Keep `region` inert while this is running: marks it now and again whenever its children change
 * (a page drawn after the first answer, a dialog opening or closing). Returns the stop function.
 * `within` names the part of `region` to make inert, found each time (Track details' body, which
 * is drawn only while the panel is open).
 */
export function keepInert(region: Element, within?: string): () => void {
  const marked = new Set<Element>();
  let frame = 0;
  const apply = () => {
    frame = 0;
    for (const element of marked) {
      if (!region.contains(element)) {
        marked.delete(element);
      } else if (element.querySelector(DIALOGS) !== null) {
        // A dialog opened inside what was marked: it has to be usable.
        element.removeAttribute("inert");
        marked.delete(element);
      }
    }
    // A dialog that closed leaves an element that was skipped on its account: mark it now.
    const target = within ? region.querySelector(within) : region;
    if (target) markInert(target, marked);
  };
  apply();
  const observer =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          if (frame === 0) frame = requestAnimationFrame(apply);
        });
  observer?.observe(region, { childList: true, subtree: true });
  return () => {
    observer?.disconnect();
    if (frame !== 0) cancelAnimationFrame(frame);
    clearInert(marked);
  };
}
