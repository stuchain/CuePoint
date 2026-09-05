import { useEffect, useState } from "react";
import { PlayerRegion } from "../shell/PlayerRegion";
import { PlayerBar } from "./PlayerBar";
import { selectHasPlayed } from "./playerFormat";
import { usePlayerValue } from "./playerStore";

/**
 * When the player bar exists (PLAYER-06, DEC-053).
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
 */
export function PlayerSlot() {
  const hasPlayed = usePlayerValue(selectHasPlayed);
  const [everPlayed, setEverPlayed] = useState(false);

  useEffect(() => {
    if (hasPlayed) setEverPlayed(true);
  }, [hasPlayed]);

  // `PlayerRegion` returns null when it has no children, so this renders no
  // element at all until the first play — the zero-height promise SHELL-06
  // made, kept by the component that made it rather than re-implemented here.
  return <PlayerRegion>{everPlayed ? <PlayerBar /> : undefined}</PlayerRegion>;
}
