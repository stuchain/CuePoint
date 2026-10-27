import { useSyncExternalStore } from "react";

/**
 * Whether the Camelot wheel is open, and which button opened it (PAGES-10).
 *
 * Two buttons open the one wheel: Track details' key line button (K8, DEC-282, which
 * moved it from the header), which lights the selected track (else the playing one,
 * DEC-157), and the player bar's key, which lights the playing one (BAR-5). The popover
 * lives with the details button, so the player bar reaches it through this store rather
 * than through props across the shell.
 */
export type WheelSource = "details" | "player";

export interface WheelState {
  open: boolean;
  source: WheelSource;
  /** The opener the popover hangs under, kept while it plays its exit; null when none is known. */
  anchor: HTMLElement | null;
}

let state: WheelState = { open: false, source: "details", anchor: null };
/** The opener last pressed with the pointer: a click does not focus a button everywhere. */
let pressed: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const hit = (event.target as Element | null)?.closest?.("[data-wheel-opener]");
      pressed = hit instanceof HTMLElement ? hit : null;
    },
    true,
  );
}
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
  // The popover hangs under whichever opener was used: the pressed one, else the focused one.
  const anchor = (pressed?.isConnected ? pressed : null) ?? opener?.closest<HTMLElement>("[data-wheel-opener]") ?? null;
  pressed = null;
  publish({ open: true, source, anchor });
}

export function closeWheel(options: { restoreFocus?: boolean; afterFocusMove?: boolean } = {}): void {
  if (!state.open) return;
  const target = options.restoreFocus === false ? null : opener;
  opener = null;
  publish({ ...state, open: false });
  // From a focus-out handler (M471) the browser is still moving focus to where it was going, and would
  // overwrite a focus() made now: the chip takes it back once that move is done.
  if (options.afterFocusMove) window.setTimeout(() => target?.isConnected && target.focus(), 0);
  else if (target?.isConnected) target.focus();
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
