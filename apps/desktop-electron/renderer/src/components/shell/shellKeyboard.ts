/**
 * One guard for the shell's window-level shortcuts (C201). Ctrl+B, Ctrl+I, Ctrl+K and F1 act on
 * the page behind a dialog if nothing stops them, so each asks this first: a modal dialog open
 * means the key belongs to the dialog.
 */
import { queryShown } from "./pageActive";

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
