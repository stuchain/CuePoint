import { useEffect, useState } from "react";
import type { EngineStatus } from "../../api/cuepointBridge.types";

/**
 * How often the strip re-reads engine state.
 *
 * `getStatus()` on the supervisor is an in-memory check — is there a child
 * process and a port — not an HTTP call, so this is close to free. The strip is
 * mounted for the life of the app, which is exactly why the interval is modest
 * rather than tight: a permanent component polling hard is permanent load.
 */
export const ENGINE_POLL_MS = 4000;

/**
 * Live engine status.
 *
 * `EngineStatusBanner` read the status exactly once on mount and had no refresh
 * path at all, so it reported whatever was true at first paint and then went
 * stale in silence. That was survivable for a banner someone glances at once;
 * it is a defect in a strip that is always on screen and claims to show the
 * current state. This is the replacement the SHELL-07 obligation calls for.
 */
export function useEngineStatus(pollMs: number = ENGINE_POLL_MS): EngineStatus | null {
  const [status, setStatus] = useState<EngineStatus | null>(null);

  useEffect(() => {
    const read = window.cuepoint?.getEngineStatus;
    if (!read) {
      // No bridge: the renderer runs in a browser tab during development.
      setStatus(null);
      return;
    }

    let cancelled = false;
    const poll = () => {
      void read()
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        .catch(() => {
          // A failed status read *is* a status: the engine is not reachable.
          if (!cancelled) setStatus({ connected: false, error: "Engine unreachable" });
        });
    };

    poll();
    const timer = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollMs]);

  return status;
}
