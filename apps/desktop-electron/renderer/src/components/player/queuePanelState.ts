/**
 * Whether the queue is open (R2-1, DEC-264).
 *
 * The bar's toggle sits in the player slot and the panel sits in the right
 * column, two places that share no parent, so the answer lives here, read
 * through one hook as `waveformDetailSetting.ts` does. Nothing is persisted
 * (DEC-014): the queue starts closed every session.
 *
 * Opening remembers the control that had focus. Closing from the panel's own
 * Close button would otherwise leave focus on a button that has just been
 * unmounted, so it goes back to the opener while that is still on the page.
 * Focus the user has put somewhere else (the search box, say) is left alone.
 */
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

let open = false;
/** What had focus when the queue opened. */
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

/** Open or close the queue everywhere at once. */
export function setQueueOpen(next: boolean): void {
  if (next === open) return;
  open = next;
  const returnTo = opener;
  // Read before notifying: the panel unmounts, and takes its focus with it.
  const active = document.activeElement;
  const focusLost = active === null || active === document.body || active.closest(".cp-queue") !== null;
  if (next) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  } else {
    opener = null;
  }
  listeners.forEach((listener) => listener());
  if (!next && focusLost && returnTo?.isConnected) returnTo.focus();
}

export function closeQueue(): void {
  setQueueOpen(false);
}

export function toggleQueue(): void {
  setQueueOpen(!open);
}

/** Forget the state, so each test starts with the queue closed. */
export function resetQueuePanelStateForTests(): void {
  open = false;
  opener = null;
}

export function useQueueOpen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
