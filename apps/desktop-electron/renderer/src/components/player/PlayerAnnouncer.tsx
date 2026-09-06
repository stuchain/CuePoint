import { useEffect, useRef, useState } from "react";

import type { PlayerSnapshot } from "../../api/cuepointBridge.types";
import { formatTrackMeta } from "./playerFormat";
import { usePlayerValue } from "./playerStore";

/**
 * Saying what happened, once (PLAYER-12).
 *
 * A screen reader user gets nothing from the player bar unless something tells
 * them the track changed: the bar's text updates silently, and a control they
 * are not focused on is a control they never hear about.
 *
 * The hard part is *not* saying too much. The position stream pushes several
 * times a second, and a live region that reflected the snapshot would read the
 * elapsed time out loud for ever — which is worse than silence, because it
 * makes the rest of the app unusable. So this announces only the two things
 * that are events rather than state: the track changed, and playback started or
 * stopped. Position, volume, shuffle and repeat are all announced by the
 * controls that change them, which are buttons with `aria-pressed` and sliders
 * with `aria-valuetext` (PLAYER-06).
 *
 * `polite` rather than `assertive`: a track change is worth hearing at the next
 * gap, not worth interrupting a sentence for.
 */

/** What should be said for a snapshot, or null when nothing has changed. */
export function announcementFor(snapshot: PlayerSnapshot | null): string {
  if (!snapshot) return "";
  const item = snapshot.queue.currentItem;
  if (!item) return "";
  const meta = formatTrackMeta(item);
  const name = meta ? `${item.title} — ${meta}` : item.title;
  if (snapshot.playback.paused) return `Paused: ${name}`;
  if (!snapshot.playback.playing) return `Stopped: ${name}`;
  return `Playing: ${name}`;
}

export function PlayerAnnouncer() {
  const message = usePlayerValue(announcementFor);
  const [announced, setAnnounced] = useState("");
  const last = useRef("");

  useEffect(() => {
    // Only when the sentence itself changed. Re-setting identical text would
    // make some screen readers say it again on every position tick.
    if (message === last.current) return;
    last.current = message;
    setAnnounced(message);
  }, [message]);

  return (
    <div className="cp-player-announcer" role="status" aria-live="polite" aria-atomic="true">
      {announced}
    </div>
  );
}
