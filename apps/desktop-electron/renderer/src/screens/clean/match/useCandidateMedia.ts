/**
 * What the candidate on screen looks and sounds like (C14, DEC-076).
 *
 * **Art** comes through the guarded route: the engine fetches, checks and
 * re-encodes it, the preload hands over an object URL, and a remote URL never
 * reaches the page. It is released when the candidate changes or the card goes.
 *
 * **The preview** is an `<audio>` element of this page, outside the player's
 * queue (DEC-012): starting one pauses the main player, one plays at a time,
 * and it stops on a new candidate, a new track, another tab or unmount. It
 * plays on the system's default output, not the device chosen in Audio
 * settings. Offline, or with no sample, the answer is null and the card says
 * so: an empty state, not an error.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type PreviewState = "idle" | "loading" | "playing" | "none";

export interface CandidateMedia {
  artwork: string | null;
  preview: PreviewState;
  /** Play the preview, or stop it when it is playing. */
  togglePreview: () => void;
  stopPreview: () => void;
  /** False when this build cannot fetch previews at all. */
  canPreview: boolean;
}

export function useCandidateMedia(candidateId: number | null): CandidateMedia {
  const [artwork, setArtwork] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState>("idle");
  const playing = useRef<{ audio: HTMLAudioElement; url: string } | null>(null);
  const asked = useRef(0);

  useEffect(() => {
    const bridge = window.cuepoint;
    if (candidateId == null || !bridge?.getCandidateArtwork) {
      setArtwork(null);
      return;
    }
    let cancelled = false;
    let made: string | null = null;
    bridge
      .getCandidateArtwork({ candidateId, size: "inspector" })
      .then((url) => {
        if (cancelled) {
          if (url) bridge.releaseTrackArtwork?.(url);
          return;
        }
        made = url;
        setArtwork(url);
      })
      .catch(() => {
        if (!cancelled) setArtwork(null);
      });
    return () => {
      cancelled = true;
      if (made) bridge.releaseTrackArtwork?.(made);
      setArtwork(null);
    };
  }, [candidateId]);

  const release = useCallback(() => {
    asked.current += 1;
    const current = playing.current;
    playing.current = null;
    if (!current) return;
    current.audio.pause();
    window.cuepoint?.releaseCandidatePreview?.(current.url);
  }, []);

  const stopPreview = useCallback(() => {
    release();
    setPreview("idle");
  }, [release]);

  // One sound at a time, whoever starts the other: the player starting (Space,
  // the Now playing bar, a double-click) silences a preview that is sounding.
  useEffect(() => {
    const player = window.cuepoint?.player;
    if (!player?.subscribeState) return;
    return player.subscribeState((snapshot) => {
      if (playing.current && snapshot.playback.playing && !snapshot.playback.paused) {
        stopPreview();
      }
    });
  }, [stopPreview]);

  // A new candidate is another sound; leaving the card silences it.
  useEffect(() => {
    return () => {
      release();
      setPreview("idle");
    };
  }, [candidateId, release]);

  const togglePreview = useCallback(() => {
    if (playing.current) {
      stopPreview();
      return;
    }
    const bridge = window.cuepoint;
    if (candidateId == null || !bridge?.getCandidatePreview) return;
    const ticket = ++asked.current;
    setPreview("loading");
    void (async () => {
      let url: string | null = null;
      try {
        url = await bridge.getCandidatePreview!({ candidateId });
      } catch {
        url = null;
      }
      if (ticket !== asked.current) {
        if (url) bridge.releaseCandidatePreview?.(url);
        return;
      }
      if (!url) {
        setPreview("none");
        return;
      }
      // One sound at a time: the player gives way to a preview.
      try {
        const state = await bridge.player?.getState();
        if (state?.playback.playing && !state.playback.paused) await bridge.player?.pause();
      } catch {
        // A player that cannot be asked is not a reason to stay silent.
      }
      if (ticket !== asked.current) {
        bridge.releaseCandidatePreview?.(url);
        return;
      }
      const audio = new Audio(url);
      audio.addEventListener("ended", () => {
        if (playing.current?.audio !== audio) return;
        release();
        setPreview("idle");
      });
      playing.current = { audio, url };
      try {
        await audio.play();
        if (ticket === asked.current) setPreview("playing");
      } catch {
        if (ticket === asked.current) {
          release();
          setPreview("none");
        }
      }
    })();
  }, [candidateId, release, stopPreview]);

  return {
    artwork,
    preview,
    togglePreview,
    stopPreview,
    canPreview: Boolean(window.cuepoint?.getCandidatePreview),
  };
}
