/**
 * The Details toggle: the last button of every page's header, after a small divider.
 *
 * The Track details panel lives in the shell and the header in each page, so the panel
 * publishes whether it is open and how to toggle it here, and `ScreenHeader` draws the button.
 * That keeps one implementation: no page passes anything. Nothing published (a page rendered
 * on its own, in a test) draws no button.
 */
import { useSyncExternalStore } from "react";
import { Button } from "../Button";
import { Hint } from "../Hint";

interface DetailsControl {
  open: boolean;
  toggle: () => void;
}

let control: DetailsControl | null = null;
const listeners = new Set<() => void>();

/** Called by whatever owns the right column (Track details, or the queue while it is open). */
export function publishDetails(next: DetailsControl | null): void {
  if (control === next) return;
  if (control && next && control.open === next.open && control.toggle === next.toggle) return;
  control = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => control;

/**
 * Whether the Track details panel is open now. A page that shows one right-hand panel at a time
 * (Prepare's source panel gives way to it) reads this instead of looking for the panel's element.
 */
export function useDetailsOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => control?.open ?? false,
    () => false,
  );
}

/** Where focus goes when the panel's own close button hid it: back to the toggle that opens it. */
export const DETAILS_TOGGLE_ATTRIBUTE = "data-details-toggle";

/** The id of the Track details panel (an `<aside>` in the shell), which the toggle names in `aria-controls`. */
export const DETAILS_PANEL_ID = "cp-track-details-panel";

/**
 * Whether a toggle is on screen. Pages the shell keeps mounted but hidden each draw a toggle of
 * their own; focus must go to the one a person can see.
 */
export function isShown(element: HTMLElement): boolean {
  if (typeof element.checkVisibility === "function") return element.checkVisibility();
  // No layout to ask (a test DOM): a hidden attribute or display: none on it or an ancestor.
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.hidden || getComputedStyle(node).display === "none") return false;
  }
  return true;
}

export function focusDetailsToggle(): void {
  const toggles = document.querySelectorAll<HTMLElement>(`[${DETAILS_TOGGLE_ATTRIBUTE}]`);
  for (const toggle of toggles) {
    if (!isShown(toggle)) continue;
    toggle.focus();
    return;
  }
}

/** `divided`: a small divider before the button, when the page has buttons of its own before it. */
export function DetailsToggle({ divided = false }: { divided?: boolean }) {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!current) return null;
  const words = current.open ? "Hide track details" : "Show track details";
  return (
    <>
      {divided ? <span className="cp-details-divider" aria-hidden="true" /> : null}
      <Hint text={words} shortcut="Mod+I">
        <Button
          variant="secondary"
          icon="panel-right"
          className="cp-details-toggle"
          onClick={current.toggle}
          // A toggle: pressed while the panel is open, drawn by the shared on look (D1).
          aria-pressed={current.open}
          aria-controls={current.open ? DETAILS_PANEL_ID : undefined}
          // One name whatever the state: the state is aria-pressed's, and the hint says the action.
          // (The panel's own close button is "Hide track details".)
          aria-label="Track details"
          {...{ [DETAILS_TOGGLE_ATTRIBUTE]: "" }}
        >
          Details
        </Button>
      </Hint>
    </>
  );
}
