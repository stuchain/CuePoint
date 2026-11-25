/**
 * Whether the Party view is open: the bar's crowd button sits in the player slot and the overlay
 * sits over the page area, two places that share no parent, so the answer lives here and is read
 * through one hook, as `queuePanelState.ts` does for the queue. Nothing is persisted: the view
 * starts closed every session.
 *
 * Opening remembers the control that had focus; closing while focus is lost (it was inside the
 * overlay, which has just unmounted) puts it back there while that control is still on the page.
 * When that control is gone (opened from the More menu, whose item closed with the menu) focus goes
 * to the bar's crowd button, else its More button.
 */
import { useSyncExternalStore } from "react";

import { useCrowdSetting } from "./crowdSetting";

/** The view's element id, for the bar button's `aria-controls`. */
export const PARTY_VIEW_ID = "cp-party-view";

const listeners = new Set<() => void>();

let open = false;
/** What had focus when the view opened. */
let opener: HTMLElement | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): boolean {
  return open;
}

/** Open or close the Party view everywhere at once. */
export function setPartyViewOpen(next: boolean): void {
  if (next === open) return;
  open = next;
  const returnTo = opener;
  // Read before notifying: the overlay unmounts, and takes its focus with it.
  const active = document.activeElement;
  const focusLost = active === null || active === document.body || active.closest(".cp-party") !== null;
  opener = next && document.activeElement instanceof HTMLElement ? document.activeElement : null;
  listeners.forEach((listener) => listener());
  if (!next && focusLost) {
    // A menu (or its leaving copy) that opened the view is gone as far as a person is concerned.
    const usable = returnTo?.isConnected === true && returnTo.closest('[role="menu"], [data-leaving]') === null;
    const target = usable ? returnTo : fallbackTarget();
    target?.focus();
  }
}

/** Where focus goes when what opened the view is gone: the bar's own way back to it. */
function fallbackTarget(): HTMLElement | null {
  const bar = document.querySelector(".cp-player-bar");
  const found =
    bar?.querySelector('button[aria-label="Party view"]') ?? bar?.querySelector('button[aria-label="More player controls"]');
  return found instanceof HTMLElement ? found : null;
}

export function closePartyView(): void {
  setPartyViewOpen(false);
}

export function togglePartyView(): void {
  setPartyViewOpen(!open);
}

/** Forget the state, so each test starts with the view closed. */
export function resetPartyViewStateForTests(): void {
  open = false;
  opener = null;
}

export function usePartyViewOpen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Whether the view is on screen: open, and the crowd still switched on in Settings. */
export function usePartyViewShown(): boolean {
  const open = usePartyViewOpen();
  const [enabled] = useCrowdSetting();
  return open && enabled;
}
