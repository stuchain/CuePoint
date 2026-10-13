import { useEffect, useMemo, useRef, useState } from "react";

import { LIBRARY_HEALTH, useSharedRead } from "../api/sharedReads";

/** What the first-run guide and the first-steps list tick from. */
export interface FirstRunProgress {
  /** Tracks in the library; null while unread or without a bridge. */
  trackCount: number | null;
  /** Tracks looked up on Beatport; null while unread or without a bridge. */
  matchedCount: number | null;
  /** A Beatport sign-in (or a pasted or environment token) is in place. */
  signedIn: boolean;
}

/**
 * Library Health comes through the shared cache (C19d), which reads it again when the library
 * announces a change or a job ends, and it is read again when the window comes back to the
 * front, so a match run in Clean ticks without a reload. A failed re-read keeps the last
 * answer: it must not untick a step. While not `enabled` the last answer is kept too.
 */
function useLibraryCounts(enabled: boolean): { trackCount: number | null; matchedCount: number | null } {
  const read = useSharedRead(LIBRARY_HEALTH, enabled);
  const { refresh } = read;
  const kept = useRef<{ trackCount: number | null; matchedCount: number | null }>({
    trackCount: null,
    matchedCount: null,
  });

  useEffect(() => {
    if (!enabled) return;
    const again = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, enabled]);

  const health = read.value;
  return useMemo(() => {
    if (health) {
      const notMatched = health.counts.find((count) => count.id === "not_matched")?.count;
      kept.current = {
        trackCount: health.track_count,
        matchedCount: notMatched === undefined ? null : health.track_count - notMatched,
      };
    }
    return kept.current;
  }, [health]);
}

/** True while signed in to Beatport; read once and then followed through main's announcements. */
function useSignedIn(enabled: boolean): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const cuepoint = window.cuepoint;
    let current = true;
    // An announcement is newer than the first read, which may answer after it.
    let heardEvent = false;
    const apply = (state: string) => {
      if (current) setSignedIn(state === "signed_in" || state === "pasted" || state === "env");
    };
    if (!cuepoint?.getBeatportAuth) {
      // An older bridge: the saved token is the nearest answer.
      cuepoint
        ?.getBeatportTokenStatus?.()
        .then((status) => {
          if (current) setSignedIn(status.configured);
        })
        .catch(() => {
          if (current) setSignedIn(false);
        });
      return () => {
        current = false;
      };
    }
    cuepoint
      .getBeatportAuth()
      .then((auth) => {
        if (!heardEvent) apply(auth.state);
      })
      .catch(() => {
        if (!heardEvent) apply("signed_out");
      });
    const unsubscribe = cuepoint.onBeatportAuthChanged?.((auth) => {
      heardEvent = true;
      apply(auth.state);
    });
    return () => {
      current = false;
      unsubscribe?.();
    };
  }, [enabled]);
  return signedIn;
}

/** `enabled` false (a closed guide) reads and subscribes to nothing; the last answers are kept. */
export function useFirstRunProgress(enabled = true): FirstRunProgress {
  const { trackCount, matchedCount } = useLibraryCounts(enabled);
  const signedIn = useSignedIn(enabled);
  return { trackCount, matchedCount, signedIn };
}
