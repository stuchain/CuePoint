/**
 * The keyboard of a `role="toolbar"`: one Tab stop, the arrows move between the
 * buttons, Home and End jump to the first and last (the WAI-ARIA toolbar
 * pattern).
 *
 * Disabled buttons in these bars are `aria-disabled`, not `disabled`, so the
 * arrows land on them and the reason in their title can be read. The Library's
 * selection bar and the bar under the Collections tree both use it.
 */
import { useCallback, useRef, useState, type KeyboardEvent } from "react";

export function useToolbarKeys(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  /** The button Tab lands on; the arrows move it (a roving tabindex). */
  const [stop, setStop] = useState(0);
  const current = Math.max(0, Math.min(stop, count - 1));

  const focusButton = useCallback((index: number) => {
    setStop(index);
    ref.current?.querySelectorAll<HTMLElement>("button")[index]?.focus();
  }, []);

  /** Handles a movement key; true when it was one, so the caller can stop there. */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>): boolean => {
      let next: number;
      if (event.key === "ArrowRight") next = (current + 1) % count;
      else if (event.key === "ArrowLeft") next = (current + count - 1) % count;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = count - 1;
      else return false;
      event.preventDefault();
      focusButton(next);
      return true;
    },
    [count, current, focusButton],
  );

  return {
    ref,
    /** The button that currently holds the Tab stop. */
    current,
    onKeyDown,
    /** Props for button `index`: its tabindex, and taking the stop when focused. */
    buttonProps: (index: number) => ({
      tabIndex: current === index ? 0 : -1,
      onFocus: () => setStop(index),
    }),
  };
}
