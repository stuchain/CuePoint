import { flushSync } from "react-dom";

/**
 * Shared-element transitions (PAGES-12, DEC-134): a search result into its Library row,
 * through the View Transitions API, and nothing else. (A Set's entry into the Inspector was
 * built and taken out: while a view transition is live Chromium sends the pointer to the page
 * root, so the second click of a double-click-to-play on a Set's row, or a shift-click, was lost.)
 *
 * Gated like the rest: only while `<html data-motion-shared="on">` (the switch on, the system
 * not asking for reduced motion) and only where the browser has the API. Otherwise the
 * change simply happens. The name is put on the two elements for the length of the
 * transition and taken off after, so it is never on two at once. Nothing in here catches or
 * re-sends a click: the page takes its own events, transition or not.
 */

export type SharedName = "cp-shared-result";

interface ViewTransitionLike {
  finished: Promise<unknown>;
}
type StartViewTransition = (update: () => void) => ViewTransitionLike;

function starter(): StartViewTransition | null {
  if (typeof document === "undefined") return null;
  if (!document.documentElement.hasAttribute("data-motion-shared")) return null;
  const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition;
  return typeof start === "function" ? start.bind(document) : null;
}

function nameOf(element: Element, name: string | null) {
  const style = (element as HTMLElement).style;
  if (name === null) style.removeProperty("view-transition-name");
  else style.setProperty("view-transition-name", name);
}

/**
 * Runs `update` (the navigation or selection that moves the thing) as a shared-element
 * transition from `from` to whatever `to` finds afterwards. Returns whether a
 * transition ran; `update` runs either way, exactly once.
 */
export function sharedTransition(
  name: SharedName,
  from: Element | null,
  update: () => void,
  to: () => Element | null,
): boolean {
  const start = starter();
  // A copy that is leaving (a closing menu's, a ghost) is not the app: it has nothing to move from.
  if (!start || !from || from.closest("[inert], [data-leaving]")) {
    update();
    return false;
  }
  nameOf(from, name);
  let target: Element | null = null;
  const transition = start(() => {
    nameOf(from, null);
    // Rendered before the new picture is taken, and the landing looked for once, right after.
    // Nothing waits in here: Chromium paints no frame while the update runs, so a wait on
    // one would hold the window still until it gave up. No landing, no name: the page just
    // changes.
    flushSync(update);
    target = to();
    if (target) nameOf(target, name);
  });
  const clear = () => {
    nameOf(from, null);
    if (target) nameOf(target, null);
  };
  transition.finished.then(clear, clear);
  return true;
}
