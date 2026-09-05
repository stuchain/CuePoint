import type { PlayerSnapshot } from "../../api/cuepointBridge.types";
import { usePlayerValue } from "../player/playerStore";

/**
 * What the status strip says about the player (PLAYER-03, extended by PLAYER-06).
 *
 * Reads through the shared player store rather than opening a subscription of
 * its own. That is not tidiness: playback position moves several times a second
 * for the length of every track, and a component subscribed to whole snapshots
 * repaints at that rate forever. Selecting the *message* means the strip
 * repaints when the player's health changes and never because a position moved.
 */

/**
 * The strip's line about the player, or null for "say nothing".
 *
 * Silence is the common case and the correct one. A user who has never played
 * anything does not need to be told the audio player is idle, and a build with
 * no bundled mpv (Linux, per PLAYER-01) must not nag on every screen — that
 * failure is reported when someone actually tries to play something.
 *
 * The strip speaks only when the player was in use and broke, which is the
 * DEC-026 bargain: the strip reports things that are happening, not things
 * that are merely true.
 */
export function playerStatusMessage(snapshot: PlayerSnapshot | null): string | null {
  if (!snapshot) return null;
  const { status } = snapshot;
  if (status.reconnecting) return "Audio player reconnecting";
  // `available` distinguishes "it broke" from "it was never installed".
  if (status.available && status.error) return "Audio player unavailable";
  return null;
}

/** Identity selector, for callers that genuinely want the whole snapshot. */
function selectSnapshot(state: PlayerSnapshot | null): PlayerSnapshot | null {
  return state;
}

/** Live player state. Re-renders on every push; prefer a narrower selector. */
export function usePlayerStatus(): PlayerSnapshot | null {
  return usePlayerValue(selectSnapshot);
}

/**
 * The strip's message, recomputed only when it actually changes.
 *
 * A string, so the default equality check is enough to keep the strip still
 * while a track plays.
 */
export function usePlayerStatusMessage(): string | null {
  return usePlayerValue(playerStatusMessage);
}
