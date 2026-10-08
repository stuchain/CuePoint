import { useCallback, useEffect, useState } from "react";
import "./SavedTick.css";

/** How long the tick stays after a change. */
const SAVED_TICK_MS = 2000;

/**
 * A settings page's answer to "did that stick?" (SET-10): a small "Saved" shown
 * for about two seconds beside a setting that applies the moment it changes.
 * `signal` is a counter the page bumps on each change (`useSavedSignal`); it is
 * an always-present status, so a screen reader hears the words when they come.
 */
export function SavedTick({ signal }: { signal: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (signal === 0) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), SAVED_TICK_MS);
    return () => window.clearTimeout(timer);
  }, [signal]);

  return (
    <span className="cp-saved-tick" role="status">
      {visible ? (
        <>
          <span aria-hidden="true">✓</span> Saved
        </>
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
