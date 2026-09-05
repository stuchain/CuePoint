import { useEffect } from "react";
import type { RepeatMode } from "../../api/cuepointBridge.types";

/**
 * Shuffle and repeat, remembered across sessions (PLAYER-07, DEC-052).
 *
 * These are *preferences*, not playback state, which is why they are persisted
 * at all. DEC-014 says CuePoint does not restore what was playing or where it
 * had got to; it says nothing about how the user likes their queue ordered, and
 * a shuffle setting that silently reset every launch would be a bug rather than
 * a decision.
 *
 * Stored in `localStorage` in the renderer, the same way the sidebar's state
 * and the table's column layout already are — not in main, and not in the
 * database. Main owns the *live* order (DEC-050) and is told the stored
 * preference at startup; it never reads storage itself.
 *
 * Reads follow the shape the rest of the shell uses: never trust storage, and
 * fall back to a default rather than throw.
 */

export const PLAYER_SHUFFLE_STORAGE_KEY = "cuepoint-player-shuffle";
export const PLAYER_REPEAT_STORAGE_KEY = "cuepoint-player-repeat";

const REPEAT_MODES: readonly RepeatMode[] = ["off", "one", "all"];

export function isRepeatMode(value: unknown): value is RepeatMode {
  return typeof value === "string" && (REPEAT_MODES as readonly string[]).includes(value);
}

export function loadShuffle(): boolean {
  try {
    return localStorage.getItem(PLAYER_SHUFFLE_STORAGE_KEY) === "1";
  } catch {
    // Storage can throw outright where site data is disabled.
    return false;
  }
}

export function saveShuffle(on: boolean): void {
  try {
    localStorage.setItem(PLAYER_SHUFFLE_STORAGE_KEY, on ? "1" : "0");
  } catch {
    // A forgotten preference is not worth breaking the toggle over.
  }
}

export function loadRepeat(): RepeatMode {
  try {
    const raw = localStorage.getItem(PLAYER_REPEAT_STORAGE_KEY);
    // An unknown value is treated as absent rather than trusted: a stored
    // "repeat: sometimes" must not become a mode nothing can handle.
    return isRepeatMode(raw) ? raw : "off";
  } catch {
    return "off";
  }
}

export function saveRepeat(mode: RepeatMode): void {
  try {
    localStorage.setItem(PLAYER_REPEAT_STORAGE_KEY, mode);
  } catch {
    // As above.
  }
}

/**
 * What pressing the repeat button does.
 *
 * Off, then all, then one — the order every player uses, and the one that puts
 * the least surprising state first: someone pressing it once means "keep
 * going", not "play this same track forever".
 */
export function nextRepeatMode(current: RepeatMode): RepeatMode {
  if (current === "off") return "all";
  if (current === "all") return "one";
  return "off";
}

/** How the repeat button describes itself in each state. */
export function repeatLabel(mode: RepeatMode): string {
  if (mode === "all") return "Repeat all";
  if (mode === "one") return "Repeat one";
  return "Repeat off";
}

/**
 * Tell main the remembered order settings, once, at startup (PLAYER-07).
 *
 * Has to happen before a queue exists rather than when the player bar mounts:
 * the bar only appears at the first play (DEC-053), and by then the queue has
 * already been built and ordered. Restoring afterwards would shuffle a queue
 * the user had already started listening to in order.
 *
 * Failures are ignored on purpose. A build with no player, or a shell where the
 * bridge is missing, must still start; the cost is a preference that does not
 * apply this session, not an app that will not open.
 */
export function useRestorePlayerOrder(): void {
  useEffect(() => {
    const player = window.cuepoint?.player;
    if (!player?.setShuffle || !player.setRepeat) return;
    void player.setShuffle(loadShuffle()).catch(() => undefined);
    void player.setRepeat(loadRepeat()).catch(() => undefined);
  }, []);
}
