/**
 * The waveform analysis, followed while a view shows it (WAVE-03, WAVE-05).
 *
 * Read every two seconds while a visible view shows it (one shared read for
 * every view, see `analysisStore`), as the status strip discovers jobs: the
 * analysis starts on its own after every file check, at launch and on a
 * request, and nothing broadcasts that. Pause and Resume answer the state after
 * them, which replaces the last read at once, so the button changes as it is
 * pressed rather than at the next poll.
 *
 * "Delete waveform data" (WAVE-05) answers what it deleted and the state
 * after, which replaces the last read the same way, and empties the waveforms
 * every view holds.
 *
 * Every answer is `{ value, refusal }`. A refusal — the pause could not be
 * saved, or the data could not be deleted — is returned to the caller to say
 * in its own words; anything else that fails is an error the view shows in
 * place of the state.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type {
  WaveformAnalysisStatus,
  WaveformAnswer,
  WaveformDataDeleted,
  WaveformRefusal,
} from "../../api/cuepointBridge.types";
import { usePageActive } from "../shell/pageActive";
import {
  failAnalysis,
  followAnalysis,
  getAnalysisSnapshot,
  subscribeAnalysis,
  takeAnalysisStatus,
} from "./analysisStore";
import { forgetWaveforms } from "./waveformCache";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";

/** How often the analysis is read while a view shows it. */
const ANALYSIS_POLL_MS = 2000;

/**
 * `status` and `error` are shared by every view using this hook and persist
 * between mounts, on purpose (see `analysisStore`); `busy` is per view.
 */
interface WaveformAnalysis {
  /** The last state read, or null before the first read. */
  status: WaveformAnalysisStatus | null;
  /** Why the state could not be read, or null. */
  error: string | null;
  /** False when this build's bridge has no waveform analysis at all. */
  supported: boolean;
  /** True while a pause or resume is on its way. */
  busy: boolean;
  /** Pause; answers the refusal standing in for the new state, if any. */
  pause: () => Promise<WaveformRefusal | null>;
  /** Resume, or start; answers the refusal standing in for the new state, if any. */
  resume: () => Promise<WaveformRefusal | null>;
  /** Delete the waveform data: what went, or the refusal; null when it could not ask. */
  deleteData: () => Promise<WaveformAnswer<WaveformDataDeleted> | null>;
}

type Call = () => Promise<WaveformAnswer<WaveformAnalysisStatus>>;

export function useWaveformAnalysis(pollMs: number = ANALYSIS_POLL_MS): WaveformAnalysis {
  const bridge = window.cuepoint?.waveforms;
  const { status, error } = useSyncExternalStore(subscribeAnalysis, getAnalysisSnapshot);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const shown = usePageActive();
  const reads = Boolean(bridge?.analysis);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // One shared poll for every hook; a hidden kept page does not join it.
  useEffect(() => {
    if (!reads || !shown) return;
    return followAnalysis(pollMs);
  }, [reads, shown, pollMs]);

  const take = useCallback(
    (answer: WaveformAnswer<WaveformAnalysisStatus>): WaveformRefusal | null => {
      if (answer.refusal) return answer.refusal;
      takeAnalysisStatus(answer.value);
      return null;
    },
    [],
  );

  const act = useCallback(
    async (call: Call | undefined): Promise<WaveformRefusal | null> => {
      if (!call) return null;
      setBusy(true);
      try {
        return take(await call());
      } catch (cause) {
        reportUnexpected(cause);
        failAnalysis(userMessage(cause));
        return null;
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [take],
  );

  const pause = useCallback(() => act(bridge?.pause), [act, bridge]);
  const resume = useCallback(() => act(bridge?.resume), [act, bridge]);

  const deleteData = useCallback(async (): Promise<WaveformAnswer<WaveformDataDeleted> | null> => {
    const call = bridge?.deleteData;
    if (!call) return null;
    setBusy(true);
    try {
      const answer = await call();
      if (answer.refusal) return { value: null, refusal: answer.refusal };
      forgetWaveforms();
      take({ value: answer.value.analysis, refusal: null });
      return { value: answer.value.deleted, refusal: null };
    } catch (cause) {
      reportUnexpected(cause);
      failAnalysis(userMessage(cause));
      return null;
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [bridge, take]);

  return {
    status,
    error,
    supported: Boolean(bridge?.analysis),
    busy,
    pause,
    resume,
    deleteData,
  };
}
