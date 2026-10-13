import { useEffect, useState } from "react";
import { PlayerRegion } from "../shell/PlayerRegion";
import { PlayerAnnouncer } from "./PlayerAnnouncer";
import { PlayerBar } from "./PlayerBar";
import type { PlayerSnapshot } from "../../api/cuepointBridge.types";
import { WaveformDetailStrip } from "../waveform/WaveformDetailStrip";
import { useWaveformDetailSetting } from "../waveform/waveformDetailSetting";
import { selectCurrentItem, selectHasPlayed } from "./playerFormat";
import { usePlayerValue } from "./playerStore";
import { toggleQueue, useQueueOpen } from "./queuePanelState";
import { usePlayerNotices } from "./usePlayerNotices";
import { usePlayerShortcuts } from "./usePlayerShortcuts";
import "./PlayerSlot.css";

/**
 * When the player bar exists, and what the bar's queue button shows (PLAYER-06,
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
 * The queue panel no longer opens here. It opens in the right column, in place
 * of Track details (R2-1, DEC-264), so the table keeps its height: it is a
 * place to work — reorder, remove, jump — and must not cover or squeeze the
 * table the queue was built from. This slot only holds the bar's toggle, whose
 * state is `queuePanelState`.
 *
 * Above the bar sits the zoomed waveform (T4), while the track
 * in the player is in the library and Settings › Waveforms has it on. The bar
 * itself is not touched: the strip is a row of the slot, above it.
 */
/** The library id of the track in the player; a slice, so the slot repaints for a new track only. */
function selectCurrentTrackId(state: PlayerSnapshot | null): number | null {
  return selectCurrentItem(state)?.trackId ?? null;
}

interface PlayerSlotProps {
  /** Open the playing track in the Library, or its artist's page (BAR-4). */
  onOpenTrack?: (trackId: number) => void;
  onOpenArtist?: (artist: string) => void;
}

export function PlayerSlot({ onOpenTrack, onOpenArtist }: PlayerSlotProps = {}) {
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
  const queueOpen = useQueueOpen();
  const [detailOn] = useWaveformDetailSetting();
  const trackId = usePlayerValue(selectCurrentTrackId);

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
        {detailOn && trackId !== null ? <WaveformDetailStrip key={trackId} trackId={trackId} /> : null}
        <PlayerBar
          queueOpen={queueOpen}
          onToggleQueue={toggleQueue}
          onOpenTrack={onOpenTrack}
          onOpenArtist={onOpenArtist}
        />
      </div>
    </PlayerRegion>
  );
}
