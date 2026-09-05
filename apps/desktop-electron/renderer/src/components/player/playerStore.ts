import { useEffect, useState } from "react";
import type { PlayerSnapshot } from "../../api/cuepointBridge.types";

/**
 * One subscription to playback state, read through selectors (PLAYER-06).
 *
 * The bar shows a position that moves several times a second. Every component
 * that reads playback state naively re-renders at that rate, which is the
 * performance trap PLAYER-06 was flagged for: the status strip does not care
 * about the position and must not repaint for it, and nothing outside the bar
 * should either.
 *
 * So there is one bridge subscription for the whole renderer, and components
 * select the slice they need. A selector that returns the same value leaves its
 * component alone, so the strip repaints when the player's *health* changes and
 * the bar repaints when the position does.
 *
 * The store holds no authoritative state of its own (DEC-050): it caches what
 * main pushed and nothing more. Every control sends an intent and waits to be
 * told what happened, which is why pressing pause cannot leave the button
 * showing "paused" over a player that never paused.
 */

type Listener = () => void;

let snapshot: PlayerSnapshot | null = null;
const listeners = new Set<Listener>();
let unsubscribeBridge: (() => void) | null = null;

/** Replace the cached snapshot and wake every selector. */
function publish(next: PlayerSnapshot | null): void {
  snapshot = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  if (!unsubscribeBridge) {
    const player = window.cuepoint?.player;
    if (player?.subscribeState) {
      unsubscribeBridge = player.subscribeState((next) => publish(next));
      // The subscription answers with current state immediately, but a shell
      // that only pushed on change would leave the first paint blank.
      void player
        .getState()
        .then((state) => {
          if (snapshot === null) publish(state);
        })
        .catch(() => {
          /* Nothing to show; selectors keep answering null. */
        });
    }
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeBridge) {
      unsubscribeBridge();
      unsubscribeBridge = null;
      snapshot = null;
    }
  };
}

/** The cached snapshot, or null when there is no bridge or nothing has played. */
export function getPlayerSnapshot(): PlayerSnapshot | null {
  return snapshot;
}

/**
 * Read one slice of playback state.
 *
 * `select` must be stable — a module-level function, not an inline closure —
 * because it is captured once per mount. `isEqual` decides when a change is
 * worth a render; the default is fine for strings, numbers and booleans, and
 * object slices should pass their own.
 */
export function usePlayerValue<T>(
  select: (state: PlayerSnapshot | null) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const [value, setValue] = useState<T>(() => select(getPlayerSnapshot()));

  useEffect(() => {
    const read = () => {
      const next = select(getPlayerSnapshot());
      setValue((previous) => (isEqual(previous, next) ? previous : next));
    };
    // Read once on mount: state may have arrived before this component did.
    read();
    return subscribe(read);
    // `select` and `isEqual` are expected to be stable; re-subscribing on every
    // render would tear the bridge subscription down and up continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

/** Reset between tests; not used by the app. */
export function resetPlayerStore(): void {
  unsubscribeBridge?.();
  unsubscribeBridge = null;
  listeners.clear();
  snapshot = null;
}
