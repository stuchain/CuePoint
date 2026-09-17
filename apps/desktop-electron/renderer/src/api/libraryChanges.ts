/**
 * "The library changed" between parts of the app that do not share state (CLEAN-13).
 *
 * The Activity panel belongs to the shell and can now revert a batch and
 * restore written tags. The Library page and its Inspector are showing values
 * those actions change, and nothing else connects the two: the panel does not
 * know which page is open, and a page does not poll. So an action that changed
 * the library announces it, and whatever is showing the library reads it again.
 *
 * A window event rather than a context, because the announcer and the
 * listeners sit in different subtrees and neither should have to be wrapped
 * for the other to work.
 */
import { useEffect, useRef } from "react";

export const LIBRARY_CHANGED_EVENT = "cuepoint:library-changed";

/** Say that tracks' values, decisions or files changed, from anywhere. */
export function announceLibraryChange(): void {
  window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
}

/** Call `onChange` whenever something announces a change, until unmounted. */
export function useLibraryChanges(onChange: () => void): void {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    const listener = () => latest.current();
    window.addEventListener(LIBRARY_CHANGED_EVENT, listener);
    return () => window.removeEventListener(LIBRARY_CHANGED_EVENT, listener);
  }, []);
}
