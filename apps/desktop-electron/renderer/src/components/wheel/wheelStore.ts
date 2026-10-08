import { useSyncExternalStore } from "react";

/**
 * Whether the Camelot wheel is open, and which button opened it (PAGES-10).
 *
 * Two buttons open the one wheel: the header's, which lights the selected track
 * (else the playing one, DEC-157), and the player bar's key, which lights the
 * playing one (BAR-5). The popover lives in the header, so the player bar reaches
 * it through this store rather than through props across the shell.
 */
export type WheelSource = "header" | "player";

export interface WheelState {
  open: boolean;
  source: WheelSource;
}

let state: WheelState = { open: false, source: "header" };
/** What had focus when it opened, so closing can give focus back. */
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function publish(next: WheelState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function getWheelState(): WheelState {
  return state;
}

export function openWheel(source: WheelSource): void {
  const active = document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body ? active : null;
  publish({ open: true, source });
}

export function closeWheel(options: { restoreFocus?: boolean } = {}): void {
  if (!state.open) return;
  const target = options.restoreFocus === false ? null : opener;
  opener = null;
  publish({ open: false, source: state.source });
  if (target?.isConnected) target.focus();
}

/** The button's own press: closes the wheel it opened, else opens it for this source. */
export function toggleWheel(source: WheelSource): void {
  if (state.open && state.source === source) closeWheel();
  else openWheel(source);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWheelState(): WheelState {
  return useSyncExternalStore(subscribe, getWheelState, getWheelState);
}
