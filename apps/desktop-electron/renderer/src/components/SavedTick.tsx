import { useCallback, useEffect, useRef, useState } from "react";
import { usePresence } from "../tokens/usePresence";
import { PixelIcon } from "./PixelIcon";
import "./SavedTick.css";

/** How long the tick stays after a change. */
const SAVED_TICK_MS = 2000;

/**
 * A settings page's answer to "did that stick?" (SET-10): a small "Saved" shown
 * for about two seconds beside a setting that applies the moment it changes.
 * `signal` is a counter the page bumps on each change (`useSavedSignal`); it is
 * an always-present status, so a screen reader hears the words when they come.
 *
 * The slot keeps one line's height whether the words are there or not, so nothing beside it moves
 * (M387), and the words fade out when they go (M380: `data-leaving`, motion on).
 */
export function SavedTick({ signal }: { signal: number }) {
  const [visible, setVisible] = useState(false);
  const presence = usePresence<HTMLSpanElement>(visible, "micro");
  // The words that were shown, kept for the fade out.
  const shownSignal = useRef(signal);
  if (visible) shownSignal.current = signal;

  useEffect(() => {
    if (signal === 0) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), SAVED_TICK_MS);
    return () => window.clearTimeout(timer);
  }, [signal]);

  return (
    <span className="cp-saved-tick" role="status">
      {presence.present ? (
        <span
          key={shownSignal.current}
          ref={presence.ref}
          className="cp-saved-tick__body"
          data-leaving={presence.leaving ? "" : undefined}
          aria-hidden={presence.leaving || undefined}
        >
          <PixelIcon name="check" size="sm" className="cp-pixel-icon--before" /> Saved
        </span>
      ) : null}
    </span>
  );
}

/** The counter a `SavedTick` follows, and the call that says "something was saved". */
export function useSavedSignal(): [number, () => void] {
  const [signal, setSignal] = useState(0);
  const saved = useCallback(() => setSignal((n) => n + 1), []);
  return [signal, saved];
}
