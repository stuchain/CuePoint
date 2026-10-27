/**
 * One guard for the shell's window-level shortcuts (C201). Ctrl+B, Ctrl+I, Ctrl+K and F1 act on
 * the page behind a dialog if nothing stops them, so each asks this first: a modal dialog open
 * means the key belongs to the dialog.
 */
import { isShown } from "./detailsToggle";
import { inHiddenPage, queryShown } from "./pageActive";

export const MODAL_DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]';

/** Whether a modal dialog is open now (one inside a page kept hidden does not count). */
export function isDialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  return queryShown(MODAL_DIALOG_SELECTOR) !== null;
}

/**
 * Whether an Escape pressed inside a side panel should close that panel (C29): it was not already
 * used by something in the panel (a menu, a field being edited), and it came from inside the panel
 * itself, not from a menu or dialog drawn elsewhere that React still routes through it.
 */
export function escapeClosesPanel(
  event: { key: string; defaultPrevented: boolean; target: EventTarget | null; currentTarget: Element },
): boolean {
  if (event.key !== "Escape" || event.defaultPrevented) return false;
  const target = event.target;
  if (!(target instanceof Element) || !event.currentTarget.contains(target)) return false;
  return target.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"]') === null;
}

/**
 * F6 and Shift+F6 move between the window's panes (M459, D34): the sidebar, the page and its panes,
 * Track details or the queue, the player. A pane is any element with `data-pane`; the shell marks
 * its own, and a page marks the panes inside it (the Library's tree and table, Prepare's source
 * panel). Panes are visited in document order, and a pane that holds another is not a stop of its
 * own: the page is a stop only when it has no panes marked inside.
 */
export const PANE_ATTRIBUTE = "data-pane";

/** The panes F6 visits now, in order: on screen, not inert, and the innermost of any that nest. */
export function shownPanes(root: ParentNode = document): HTMLElement[] {
  const all = [...root.querySelectorAll<HTMLElement>(`[${PANE_ATTRIBUTE}]`)].filter(
    (element) =>
      !inHiddenPage(element) &&
      isShown(element) &&
      element.closest("[inert]") === null &&
      // A region the shell keeps for a panel that is closed or empty holds nothing to go to.
      (element.childElementCount > 0 || element.hasAttribute("tabindex")),
  );
  return all.filter((element) => !all.some((other) => other !== element && element.contains(other)));
}

/** The pane after (or before) the one `active` is in, wrapping round; the first when focus is in none. */
export function nextPane(panes: readonly HTMLElement[], active: Element | null, backwards: boolean): HTMLElement | null {
  if (panes.length === 0) return null;
  const at = panes.findIndex((pane) => active !== null && pane.contains(active));
  if (at === -1) return backwards ? panes[panes.length - 1]! : panes[0]!;
  return panes[(at + (backwards ? panes.length - 1 : 1)) % panes.length]!;
}

/** Focus a pane: its own focus target if it is one, else the pane itself for as long as it holds focus. */
export function focusPane(pane: HTMLElement): void {
  if (!pane.hasAttribute("tabindex") && pane.tabIndex < 0) {
    pane.setAttribute("tabindex", "-1");
    pane.addEventListener("blur", () => pane.removeAttribute("tabindex"), { once: true });
  }
  pane.focus({ preventScroll: true });
}

/** The window listener behind F6 and Shift+F6. Not under a modal dialog: Tab inside it is its own. */
export function installPaneKeys(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "F6" || event.ctrlKey || event.altKey || event.metaKey) return;
    if (isDialogOpen()) return;
    const target = nextPane(shownPanes(), document.activeElement, event.shiftKey);
    if (!target) return;
    event.preventDefault();
    focusPane(target);
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
