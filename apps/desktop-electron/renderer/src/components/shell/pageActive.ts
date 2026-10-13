import { createContext, useContext } from "react";

/** Set by each kept page's slot (`KeptPages`, C19e); absent outside one. */
export const PageActiveContext = createContext<boolean>(true);

/**
 * Whether the page this is called in is the one on screen.
 *
 * Every page the user has opened stays alive behind the current one (`KeptPages`, C19e), so
 * a page can be mounted and hidden. React's Activity has already cleaned up a hidden page's
 * effects: its polls, timers, listeners and subscriptions stop, and start again when it is
 * shown, so a page rarely needs to ask. That includes `useInspectorSlot` and
 * `useReportSelectedTrack`, which clear on hide and set again on show without changes.
 *
 * Ask for what effects cannot say: work that is not an effect (a render-time derivation,
 * an event handler) that should only apply to the visible page, or a rule that depends on
 * which page is showing, such as the Inspector's per-page content.
 *
 * True outside any slot, so a page rendered alone, in a test, counts as shown.
 */
export function usePageActive(): boolean {
  return useContext(PageActiveContext);
}

/**
 * Whether `element` sits in a kept page that is hidden. Activity hides a page with
 * `display: none` on its top elements, so a hidden page's open popover or menu is still
 * in the document and a plain `querySelector` finds it.
 */
export function inHiddenPage(element: Element): boolean {
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    if (at instanceof HTMLElement && at.style.display === "none") return true;
  }
  return false;
}

/** The first element matching `selector` that is not inside a hidden kept page, or null. */
export function queryShown(selector: string): Element | null {
  for (const element of document.querySelectorAll(selector)) {
    if (!inHiddenPage(element)) return element;
  }
  return null;
}
