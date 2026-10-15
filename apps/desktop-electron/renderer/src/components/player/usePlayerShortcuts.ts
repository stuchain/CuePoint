import { useEffect, useRef } from "react";

import { focusReachedByKeyboard, installFocusOrigin } from "../shell/focusOrigin";
import { hasShortcutModifier } from "../shell/platformKeys";
import { selectVolume } from "./playerFormat";
import { usePlayerValue } from "./playerStore";
import { queryShown } from "../shell/pageActive";

/**
 * Driving playback from the keyboard (PLAYER-12, SHELL-10).
 *
 * Space is the obvious play/pause key and the dangerous one. It is also the key
 * that activates whatever has focus and the key that types a space. So the
 * rule is: Space is play/pause unless
 *
 * - **you are typing.** A text field, select, textarea or `contenteditable`
 *   keeps every key, including Ctrl+arrow, which moves the caret by word.
 * - **a dialog or menu is open.** The user is somewhere else; music must not
 *   start or stop behind it.
 * - **the focused control was reached by keyboard.** Tab to a button, row
 *   or checkbox and Space belongs to it. A control focused by a mouse
 *   click does not count: clicking Next or the waveform leaves focus there,
 *   and Space afterwards should still pause. How focus arrived comes from
 *   `focusOrigin`, not `:focus-visible`, which can flip after the fact.
 *   A slider (a range input or `role=slider`) is not on this list: it has no
 *   Space action, so Space on the seek or volume slider plays and pauses even
 *   when Tab put focus there.
 *
 * The listener is in the capture phase and stops propagation when it acts, so a
 * mouse-focused tree row, menu item or chart bar does not *also* handle the
 * same Space. `preventDefault` on keydown stops Chromium activating a button on
 * keyup.
 *
 * The arrows are Ctrl-modified deliberately. Bare arrows scroll the table and
 * move through the queue panel. Ctrl/Cmd+arrows still defer to any input, so a
 * focused range input owns its own arrows.
 */

/** How much one press of Ctrl+Up or Ctrl+Down moves the volume. */
export const PLAYER_VOLUME_STEP = 5;

/** Fields that own every key while they have focus. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Whether Space already means something to whatever has focus.
 *
 * Matched by role rather than by tag, because the app's own controls are real
 * buttons but a menu item or a queue row is a `role=` on a div.
 */
function isSpaceTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, summary, a[href], input:not([type="range"]), [role="button"], [role="menuitem"], [role="option"], [role="checkbox"], [role="tab"], [role="switch"], [role="treeitem"], [role="radio"], [role="gridcell"], [data-owns-space]',
    ),
  );
}

const NON_TEXT_INPUTS = new Set([
  "range",
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "color",
  "file",
  "image",
]);

/** Whether the target takes typed characters, so Space is a space. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/**
 * Whether a modal or an open menu is on top of the app. One left open in a page kept
 * hidden behind the current one does not count: it is not on screen.
 */
function dialogOrMenuOpen(): boolean {
  return queryShown('[role="dialog"], dialog[open], [role="menu"]') !== null;
}

export function usePlayerShortcuts(): void {
  const volume = usePlayerValue(selectVolume);
  // Read through a ref inside the handler: re-registering the listener on
  // every volume change would rebuild it several times a second while someone
  // holds the key down.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    installFocusOrigin();
    const onKeyDown = (event: KeyboardEvent) => {
      const player = window.cuepoint?.player;
      if (!player) return;
      if (event.altKey) return;
      // Meta is the shortcut key on macOS (Cmd), the system's elsewhere.
      if (event.metaKey && !hasShortcutModifier(event)) return;

      if (event.key === " " || event.code === "Space") {
        if (hasShortcutModifier(event) || event.shiftKey) return;
        if (dialogOrMenuOpen()) return;
        if (isTextEntry(event.target)) return;
        if (isSpaceTarget(event.target) && focusReachedByKeyboard(event.target)) return;
        // Prevented so the page does not also scroll, nor a focused button
        // activate on keyup; stopped so a mouse-focused row does not also act.
        event.preventDefault();
        event.stopPropagation();
        void player.toggle?.().catch(() => undefined);
        return;
      }

      if (isTypingTarget(event.target)) return;
      if (!hasShortcutModifier(event) || event.shiftKey) return;

      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          void player.next?.().catch(() => undefined);
          break;
        case "ArrowLeft":
          event.preventDefault();
          void player.previous?.().catch(() => undefined);
          break;
        case "ArrowUp":
          event.preventDefault();
          void player
            .setVolume?.(Math.min(100, volumeRef.current + PLAYER_VOLUME_STEP))
            .catch(() => undefined);
          break;
        case "ArrowDown":
          event.preventDefault();
          void player
            .setVolume?.(Math.max(0, volumeRef.current - PLAYER_VOLUME_STEP))
            .catch(() => undefined);
          break;
        default:
          break;
      }
    };

    globalThis.addEventListener("keydown", onKeyDown, true);
    return () => globalThis.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
