/**
 * Put a track a person is looking at first in the analysis (WAVE-06).
 *
 * The bar asks for the track that starts playing and the Inspector for the
 * track it shows (WAVE-03's requests). Each asks only once its answer says the
 * track waits for the analysis: an analysed track, or one whose file is missing
 * or unread, has nothing to gain, and a request starts a run when none is going.
 * A track is asked for once while it stays shown; showing another and coming
 * back asks again, which moves it to the front of the queue again.
 *
 * The Library's column never asks: a table showing forty rows is not a person
 * looking at forty tracks.
 */
import { useEffect, useRef } from "react";

import type { WaveformsBridge } from "../../api/cuepointBridge.types";
import type { WaveformEntry } from "./waveformCache";

type RequestBridge = Pick<WaveformsBridge, "request">;

function appBridge(): RequestBridge | undefined {
  return typeof window === "undefined" ? undefined : window.cuepoint?.waveforms;
}

/** True when an answer says the track waits for the analysis. */
export function waitsForAnalysis(entry: WaveformEntry | null | undefined): boolean {
  return entry?.kind === "track" && entry.track.state === "waiting";
}

export function useWaveformRequest(
  trackId: number | null,
  entry: WaveformEntry | null | undefined,
  bridge: () => RequestBridge | undefined = appBridge,
): void {
  const asked = useRef<number | null>(null);
  const waiting = waitsForAnalysis(entry);

  useEffect(() => {
    if (trackId === null) {
      asked.current = null;
      return;
    }
    if (asked.current !== null && asked.current !== trackId) asked.current = null;
    if (!waiting || asked.current === trackId) return;
    const request = bridge()?.request;
    if (!request) return;
    asked.current = trackId;
    // A refusal or a failure leaves the track where the analysis would have
    // reached it anyway: nothing to say.
    void Promise.resolve()
      .then(() => request({ track_ids: [trackId] }))
      .catch(() => undefined);
  }, [bridge, trackId, waiting]);
}
