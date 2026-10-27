import { useEffect, type CSSProperties } from "react";
import { useScaleFactor } from "../../tokens/ScaleContext";
import { PlayerRegion } from "../shell/PlayerRegion";
import { PlayerAnnouncer } from "./PlayerAnnouncer";
import { PlayerBar } from "./PlayerBar";
import { WaveformDetailStrip } from "../waveform/WaveformDetailStrip";
import { STRIP_MAX_SCALE, useContentEdge, useStripPage } from "../waveform/stripPlaces";
import { useWaveformPrefetch } from "../waveform/useWaveformPrefetch";
import { useWaveformDetailSetting } from "../waveform/waveformDetailSetting";
import { markPlayed, selectCurrentTrackId } from "./playedTracks";
import { usePlayerValue } from "./playerStore";
import { toggleQueue, useQueueOpen } from "./queuePanelState";
import { useCompactBar } from "./useCompactBar";
import { usePlayerNotices } from "./usePlayerNotices";
import { usePlayerShortcuts } from "./usePlayerShortcuts";
import "./PlayerSlot.css";

/**
 * The player bar is always there (area 83, amending DEC-053: it used to wait for the first play
 * and the page jumped by its height). Before anything has played it reads "Nothing playing" with
 * its controls greyed.
 *
 * Earlier text, kept for the history: when the player bar exists, and what the bar's queue button shows (PLAYER-06,
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
 * Above the bar sits the zoomed waveform (T4, D27), on Library, Prepare and Keys only and below 2x, while the track
 * in the player is in the library and Settings › Waveforms has it on. The bar
 * itself is not touched: the strip is a row of the slot, above it.
 */
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
  const queueOpen = useQueueOpen();
  const [detailOn] = useWaveformDetailSetting();
  // The zoomed waveform of the selected and the next track, made before they play; above the
  // early return, since a selection is made before anything has played.
  // Not in the compact bar (a window under 700px tall): the strip is not drawn there, so nothing is made for it.
  const compact = useCompactBar();
  const onStripPage = useStripPage();
  const collapsed = useScaleFactor() >= STRIP_MAX_SCALE;
  const stripOn = detailOn && !compact && onStripPage && !collapsed;
  const edge = useContentEdge();
  useWaveformPrefetch({ enabled: stripOn });
  const trackId = usePlayerValue(selectCurrentTrackId);

  // Above the early return, like the rest: a track that is played is played whether or not the
  // bar has been drawn yet (R4-6).
  useEffect(() => {
    if (trackId !== null) markPlayed(trackId);
  }, [trackId]);

  // Always drawn (area 83): before the first play the bar says "Nothing playing", so the page
  // never jumps by the bar's height when something starts.
  return (
    <PlayerRegion>
      <div className="cp-player-slot" style={{ "--detail-strip-inset": `${edge}px` } as CSSProperties}>
        <PlayerAnnouncer />
        {stripOn && trackId !== null ? <WaveformDetailStrip key={trackId} trackId={trackId} /> : null}
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
