import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { LibraryStatus } from "../../api/cuepointBridge.types";
import { LibraryRecovery } from "./LibraryRecovery";

/** How often the library's state is asked for while the answer is not there yet, or is still upgrading. */
const ASK_MS = 1500;

/** The states that take the whole window; `ok` and `upgrading` leave the app as it is. */
export function needsRecoveryScreen(status: LibraryStatus | null): boolean {
  return status !== null && ["damaged", "too_new", "upgrade_failed", "needs_space"].includes(status.state);
}

/**
 * Shows the recovery screen instead of the app while the library is damaged, from a newer
 * CuePoint, failed to update, or needs room to update (HARDEN-03, DEC-182). Any other state, and
 * the time before the first answer (the background process is starting), shows the app as it is:
 * an update in progress keeps the startup look the app already has.
 */
export function LibraryGate({ children }: { children: ReactNode }) {
  const bridge = typeof window === "undefined" ? undefined : window.cuepoint?.library;
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const live = useRef(true);

  const read = useCallback(async () => {
    try {
      const next = await bridge?.getState();
      if (next && live.current) setStatus(next);
      return next ?? null;
    } catch {
      // Not up yet: the next ask finds it.
      return null;
    }
  }, [bridge]);

  useEffect(() => {
    live.current = true;
    void read();
    const off = bridge?.onStateChanged(() => void read());
    return () => {
      live.current = false;
      off?.();
    };
  }, [bridge, read]);

  // Until there is an answer, and while the library is upgrading, ask again.
  const settled = status !== null && status.state !== "upgrading";
  useEffect(() => {
    if (!bridge || settled) return;
    const timer = setInterval(() => void read(), ASK_MS);
    return () => clearInterval(timer);
  }, [bridge, settled, read]);

  if (status !== null && needsRecoveryScreen(status)) {
    return <LibraryRecovery status={status} onState={setStatus} />;
  }
  return <>{children}</>;
}
