import { useEffect, useState } from "react";
import { PlayerRegion } from "../shell/PlayerRegion";
import { PlayerAnnouncer } from "./PlayerAnnouncer";
import { PlayerBar } from "./PlayerBar";
import { QueuePanel } from "./QueuePanel";
import { selectHasPlayed } from "./playerFormat";
import { usePlayerValue } from "./playerStore";
import { usePlayerNotices } from "./usePlayerNotices";
import { usePlayerShortcuts } from "./usePlayerShortcuts";
import "./PlayerSlot.css";

/**
 * When the player bar exists, and where the queue panel opens (PLAYER-06,
 * PLAYER-08, DEC-053).
 *
 * DEC-025 held this region at zero height through Phase 2 with a stated
 * reason: the app never ships controls that do nothing. DEC-053 keeps that
 * reason and gives it a moment to stop applying — the first play. Before then
 * the region renders nothing and takes no space, exactly as it has since
 * SHELL-06; after it, the bar stays for the rest of the session.
 *
 * The stickiness is the point. Ending a queue leaves the bar showing the last
 * track, paused, rather than making the whole app jump as a control the user
 * was just using disappears from under the pointer. There is deliberately no
 * way to retract it, and quitting resets it because nothing is persisted
 * (DEC-014).
 *
 * The queue panel opens above the bar rather than over the content: it is a
 * place to work — reorder, remove, jump — not something glanced at, and it
 * must not cover the table the queue was built from.
 */
export function PlayerSlot() {
  // Mounted here rather than in the bar, because the bar does not exist yet the
  // first time a track fails — and "the file you just double-clicked will not
  // play" is exactly the moment the user most needs to be told (PLAYER-10).
  usePlayerNotices();
  // Both live here rather than in the bar, because the bar does not exist until
  // the first play (DEC-053) and neither of these may wait for it: Space has to
  // work from the moment there is something to play, and a screen reader user
  // needs to be told about that first track too (PLAYER-12).
  usePlayerShortcuts();
  const hasPlayed = usePlayerValue(selectHasPlayed);
  const [everPlayed, setEverPlayed] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    if (hasPlayed) setEverPlayed(true);
  }, [hasPlayed]);

  // `PlayerRegion` returns null when it has no children, so this renders no
  // element at all until the first play — the zero-height promise SHELL-06
  // made, kept by the component that made it rather than re-implemented here.
  // DEC-025's promise, kept literally: nothing here, not even an empty element.
  // The announcer arrives with the bar, which is also the first moment there is
  // anything to announce.
  if (!everPlayed) return <PlayerRegion />;

  return (
    <PlayerRegion>
      <div className="cp-player-slot">
        <PlayerAnnouncer />
        {queueOpen && (
          <div className="cp-player-slot__queue">
            <QueuePanel onClose={() => setQueueOpen(false)} />
          </div>
        )}
        <PlayerBar queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((open) => !open)} />
      </div>
    </PlayerRegion>
  );
}
