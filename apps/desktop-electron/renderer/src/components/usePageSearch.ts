import { useEffect, type RefObject } from "react";

/** The inputs pages have registered, oldest first; Ctrl+F goes to the newest that is on screen. */
const registered: RefObject<HTMLInputElement | null>[] = [];
let listening = false;

function onKeyDown(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== "f" || event.altKey || event.shiftKey) return;
  if (!(event.ctrlKey || event.metaKey)) return;
  // A dialog has its own fields; the page behind it does not answer.
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
  for (let index = registered.length - 1; index >= 0; index -= 1) {
    const input = registered[index]!.current;
    if (!input) continue;
    event.preventDefault();
    input.focus();
    input.select();
    return;
  }
}

function listen() {
  if (listening) return;
  window.addEventListener("keydown", onKeyDown);
  listening = true;
}

function maybeStop() {
  if (!listening || registered.length > 0) return;
  window.removeEventListener("keydown", onKeyDown);
  listening = false;
}

/**
 * A page registers its search input here and Ctrl+F (Cmd+F on a Mac) focuses it, on any page
 * (C189). With no input registered, or a dialog open, the key does nothing at all, so the
 * browser's own find stays out of reach only where there is a search to go to. Pass nothing to
 * register nothing (a page whose search is not showing).
 */
export function usePageSearch(input: RefObject<HTMLInputElement | null> | undefined): void {
  useEffect(() => {
    if (!input) return;
    registered.push(input);
    listen();
    return () => {
      const at = registered.lastIndexOf(input);
      if (at !== -1) registered.splice(at, 1);
      maybeStop();
    };
  }, [input]);
}
