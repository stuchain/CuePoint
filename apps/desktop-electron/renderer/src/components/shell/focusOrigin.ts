/**
 * How keyboard focus arrived at an element: by keyboard or by pointer.
 *
 * `:focus-visible` is not enough. Per the spec heuristic, Chromium can start
 * matching it on a mouse-focused element once a key is pressed, which can
 * happen before a keydown listener reads it. Shortcuts need to know how focus
 * *arrived*, so this records it at `focusin`.
 *
 * The default is "keyboard": programmatic focus with no prior input keeps the
 * conservative behaviour of leaving keys to the focused control.
 */

type Origin = "pointer" | "keyboard";

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"]);

let last: Origin = "keyboard";
/** Elements whose focus came from, or was taken over by, a pointer press. */
let pointerFocused = new WeakSet<EventTarget>();
let installed = false;

/**
 * Whether `el` was reached by keyboard. Anything not known to have been
 * focused by a pointer (including an element focused before this was
 * installed) counts as keyboard.
 */
export function focusReachedByKeyboard(el: EventTarget | null): boolean {
  return el !== null && !pointerFocused.has(el);
}

/**
 * Start listening. Safe to call more than once.
 *
 * The listeners are on `window` in the capture phase, ahead of anything the
 * app registers there afterwards: the Space shortcut also listens at window
 * capture and stops propagation, so a `document` listener would never see
 * that key. Install this before adding such a listener.
 */
export function installFocusOrigin(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener(
    "pointerdown",
    (event) => {
      last = "pointer";
      // Pressing an already-focused control (reached by Tab, say) hands it to
      // the pointer: no `focusin` follows, but a Space now is not the
      // keyboard's.
      const active = document.activeElement;
      if (
        active &&
        active !== document.body &&
        active !== document.documentElement &&
        event.target instanceof Node &&
        active.contains(event.target)
      ) {
        pointerFocused.add(active);
      }
    },
    true,
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (!MODIFIER_KEYS.has(event.key)) last = "keyboard";
    },
    true,
  );
  window.addEventListener(
    "focusin",
    (event) => {
      if (!event.target) return;
      if (last === "pointer") pointerFocused.add(event.target);
      else pointerFocused.delete(event.target);
    },
    true,
  );
}

/** For tests: forget everything recorded so far. */
export function resetFocusOrigin(): void {
  last = "keyboard";
  pointerFocused = new WeakSet();
}
