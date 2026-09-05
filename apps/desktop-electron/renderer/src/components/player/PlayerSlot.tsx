import { useEffect, useState } from "react";
import { PlayerRegion } from "../shell/PlayerRegion";
import { PlayerBar } from "./PlayerBar";
import { QueuePanel } from "./QueuePanel";
import { selectHasPlayed } from "./playerFormat";
import { usePlayerValue } from "./playerStore";
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
  const hasPlayed = usePlayerValue(selectHasPlayed);
  const [everPlayed, setEverPlayed] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    if (hasPlayed) setEverPlayed(true);
  }, [hasPlayed]);

  // `PlayerRegion` returns null when it has no children, so this renders no
  // element at all until the first play — the zero-height promise SHELL-06
  // made, kept by the component that made it rather than re-implemented here.
  if (!everPlayed) return <PlayerRegion />;

  return (
    <PlayerRegion>
      <div className="cp-player-slot">
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
