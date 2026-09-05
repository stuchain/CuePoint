import { useEffect, useState } from "react";
import type { PlayerSnapshot } from "../../api/cuepointBridge.types";

/**
 * Live player state, pushed from the main process (PLAYER-03, DEC-050).
 *
 * Pushed rather than polled, unlike `useEngineStatus`. Engine status is a
 * cheap in-memory check that changes rarely, so a 4-second poll is fine.
 * Playback position changes continuously and a poll would either lag visibly
 * or hammer the bridge — so main publishes, already coalesced, and this just
 * listens.
 *
 * `null` means the bridge is absent: the renderer is running in a browser tab,
 * or in a shell built before the player existed. Callers render nothing rather
 * than guessing.
 */
export function usePlayerStatus(): PlayerSnapshot | null {
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);

  useEffect(() => {
    const player = window.cuepoint?.player;
    if (!player?.subscribeState) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    const unsubscribe = player.subscribeState((next) => {
      if (!cancelled) setSnapshot(next);
    });

    // The subscription answers with the current state immediately, but ask
    // anyway: a shell that pushes only on change would otherwise leave the
    // first paint blank.
    void player
      .getState()
      .then((state) => {
        if (!cancelled) setSnapshot((current) => current ?? state);
      })
      .catch(() => {
        /* No state to show; the strip stays quiet. */
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return snapshot;
}

/**
 * What the status strip should say about the player, or null for "say nothing".
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
