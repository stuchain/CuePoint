/**
 * The waveform analysis, followed while a view shows it (WAVE-03).
 *
 * Read every two seconds while mounted, as the status strip discovers jobs: the
 * analysis starts on its own after every file check, at launch and on a
 * request, and nothing broadcasts that. Pause and Resume answer the state after
 * them, which replaces the last read at once, so the button changes as it is
 * pressed rather than at the next poll.
 *
 * Every answer is `{ value, refusal }`. A refusal — the pause could not be
 * saved — is returned to the caller to say in its own words; anything else
 * that fails is an error the view shows in place of the state.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  WaveformAnalysisStatus,
  WaveformAnswer,
  WaveformRefusal,
} from "../../api/cuepointBridge.types";

/** How often the analysis is read while a view shows it. */
export const ANALYSIS_POLL_MS = 2000;

export interface WaveformAnalysis {
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
}

type Call = () => Promise<WaveformAnswer<WaveformAnalysisStatus>>;

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useWaveformAnalysis(pollMs: number = ANALYSIS_POLL_MS): WaveformAnalysis {
  const bridge = window.cuepoint?.waveforms;
  const [status, setStatus] = useState<WaveformAnalysisStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const take = useCallback(
    (answer: WaveformAnswer<WaveformAnalysisStatus>): WaveformRefusal | null => {
      if (answer.refusal) return answer.refusal;
      if (alive.current) {
        setStatus(answer.value);
        setError(null);
      }
      return null;
    },
    [],
  );

  useEffect(() => {
    const read = bridge?.analysis;
    if (!read) return;
    let cancelled = false;
    const poll = () => {
      void read()
        .then((answer) => {
          if (cancelled) return;
          const refusal = take(answer);
          if (refusal) setError(refusal.message);
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(messageOf(cause));
        });
    };
    poll();
    const timer = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [bridge, pollMs, take]);

  const act = useCallback(
    async (call: Call | undefined): Promise<WaveformRefusal | null> => {
      if (!call) return null;
      setBusy(true);
      try {
        return take(await call());
      } catch (cause) {
        if (alive.current) setError(messageOf(cause));
        return null;
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [take],
  );

  const pause = useCallback(() => act(bridge?.pause), [act, bridge]);
  const resume = useCallback(() => act(bridge?.resume), [act, bridge]);

  return { status, error, supported: Boolean(bridge?.analysis), busy, pause, resume };
}
