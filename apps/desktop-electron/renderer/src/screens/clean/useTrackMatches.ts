/**
 * One track's matches, for the comparison panel (CLEAN-12, DEC-066).
 *
 * Two reads: the track's state and every attempt, then the candidates of the
 * attempt being looked at. The panel opens on the attempt the state points at
 * — the one a decision was made on, or the newest — and every earlier attempt
 * is one choice away, because a disputed decision is exactly the case where
 * the older attempt and the newer one both matter.
 *
 * A response is kept only if it answers the track and attempt still asked
 * about: a reviewer pressing Down twenty times must not see the fourth track's
 * candidates arrive under the twentieth.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { MatchCandidate, TrackMatches } from "../../api/cuepointBridge.types";

export interface TrackMatchesState {
  matches: TrackMatches | null;
  attemptId: number | null;
  candidates: MatchCandidate[];
  loading: boolean;
  error: string | null;
  chooseAttempt: (attemptId: number) => void;
  reload: () => void;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useTrackMatches(trackId: number | null): TrackMatchesState {
  const [matches, setMatches] = useState<TrackMatches | null>(null);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const trackAsked = useRef<number | null>(null);

  useEffect(() => {
    const previousTrack = trackAsked.current;
    trackAsked.current = trackId;
    const bridge = window.cuepoint?.getTrackMatches;
    if (trackId == null || !bridge) {
      setMatches(null);
      setAttemptId(null);
      setCandidates([]);
      setError(trackId == null ? null : "CuePoint's engine is not available in this window");
      setLoading(false);
      return;
    }
    let cancelled = false;
    const sameTrack = previousTrack === trackId;
    if (!sameTrack) {
      setMatches(null);
      setCandidates([]);
    }
    setLoading(true);
    bridge({ trackId })
      .then((payload) => {
        if (cancelled) return;
        setMatches(payload);
        setError(null);
        setAttemptId((current) => {
          // Re-reading the same track keeps the attempt being looked at, as
          // long as it still exists; a new track opens on its own.
          if (sameTrack && current != null && payload.attempts.some((a) => a.id === current)) {
            return current;
          }
          return payload.state.attempt_id ?? payload.attempts[0]?.id ?? null;
        });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageOf(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, reloads]);

  useEffect(() => {
    const bridge = window.cuepoint?.getMatchCandidates;
    if (attemptId == null || !bridge) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    bridge({ attemptId })
      .then((payload) => {
        if (!cancelled) setCandidates(payload.candidates);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageOf(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId, reloads]);

  const reload = useCallback(() => setReloads((value) => value + 1), []);
  const chooseAttempt = useCallback((id: number) => setAttemptId(id), []);

  return { matches, attemptId, candidates, loading, error, chooseAttempt, reload };
}
