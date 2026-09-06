import { useEffect, useRef } from "react";

import { selectVolume } from "./playerFormat";
import { usePlayerValue } from "./playerStore";

/**
 * Driving playback from the keyboard (PLAYER-12, SHELL-10).
 *
 * Space is the obvious play/pause key and the dangerous one. It is also the key
 * that activates whatever has focus — every button, checkbox, link and menu
 * item in the app — and the key that types a space. A play/pause binding that
 * did not know that would pause the music every time someone pressed a button,
 * and would put a space in the filter bar *and* stop the track while they were
 * typing a search.
 *
 * So the guard is the feature here, and it has three parts:
 *
 * - **Typing wins.** Anything inside a text field, a select or a
 *   `contenteditable` keeps every key, including Ctrl+arrow, which moves the
 *   caret by word.
 * - **The focused control wins.** If focus is on something Space already
 *   activates, Space belongs to it. Pressing a button must do one thing.
 * - **A dialog on top wins.** While a modal is open the user is somewhere
 *   else; music must not start or stop behind it.
 *
 * The arrows are Ctrl-modified deliberately. Bare arrows scroll the table and
 * move through the queue panel, and taking them would break the two places
 * where a keyboard user spends their time.
 */

/** How much one press of Ctrl+Up or Ctrl+Down moves the volume. */
export const PLAYER_VOLUME_STEP = 5;

/** Fields that own every key while they have focus. */
export function isTypingTarget(target: EventTarget | null): boolean {
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
export function isSpaceTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'button, summary, a[href], [role="button"], [role="menuitem"], [role="option"], [role="checkbox"], [role="tab"], [role="switch"]',
    ),
  );
}

/** Whether a modal is on top of the app. */
function dialogIsOpen(): boolean {
  return document.querySelector('[role="dialog"], dialog[open]') !== null;
}

export function usePlayerShortcuts(): void {
  const volume = usePlayerValue(selectVolume);
  // Read through a ref inside the handler: re-registering the listener on
  // every volume change would rebuild it several times a second while someone
  // holds the key down.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const player = window.cuepoint?.player;
      if (!player) return;
      if (event.altKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === " " || event.code === "Space") {
        if (event.ctrlKey || event.shiftKey) return;
        if (isSpaceTarget(event.target) || dialogIsOpen()) return;
        // Prevented so the page does not also scroll, which is what Space
        // does to a scrollable container by default.
        event.preventDefault();
        void player.toggle?.().catch(() => undefined);
        return;
      }

      if (!event.ctrlKey || event.shiftKey) return;

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

    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, []);
}
