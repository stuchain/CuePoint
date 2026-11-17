import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { LibraryStatus } from "../../api/cuepointBridge.types";
import { useOptionalToast } from "../../components/Toast";
import { ensureRestoreWired, onRestoreSettled } from "../backups/restoreStore";
import { LibraryRecovery } from "./LibraryRecovery";
import { LibraryUpgrading } from "./LibraryUpgrading";

/** How often the library's state is asked for while the answer is not there yet, or is still settling. */
const ASK_MS = 1500;
/** After a restore ends, how many asks it takes at most to see the library's new state. */
const AFTER_RESTORE_TRIES = 40;
/** The most the startup wait screen stays up: past it the app shows, so its own offline and restart handling is reachable. */
const WAIT_SCREEN_MAX_MS = 60_000;

/** The states that take the whole window; `ok` and `upgrading` never take the recovery screen. */
export function needsRecoveryScreen(status: LibraryStatus | null): boolean {
  return status !== null && ["damaged", "too_new", "upgrade_failed", "needs_space"].includes(status.state);
}

/**
 * Shows the recovery screen instead of the app while the library is damaged, from a newer
 * CuePoint, failed to update, or needs room to update (HARDEN-03, DEC-182). Any other state, and
 * the time before the first answer (the background process is starting), shows the app as it is.
 * An update running at startup, before any settled state has been seen, shows a wait screen
 * instead, so the pages do not load against a library that is not ready. An update that runs
 * later (after a restore, or "Try again" behind the recovery screen) keeps the app or the
 * recovery screen until the library says how it ended.
 *
 * It also reads the state again after any restore, wherever it was asked from.
 */
export function LibraryGate({ children }: { children: ReactNode }) {
  const bridge = typeof window === "undefined" ? undefined : window.cuepoint?.library;
  const [status, setStatusState] = useState<LibraryStatus | null>(null);
  const current = useRef<LibraryStatus | null>(null);
  const live = useRef(true);
  // Whether a settled state (anything but "upgrading") has been seen this session.
  const [seenSettled, setSeenSettled] = useState(false);
  // The wait screen ran out of time (the background process died or hung mid-update).
  const [waitExpired, setWaitExpired] = useState(false);
  // Asks left after a restore: the state it ends in may take a moment to be worked out.
  const [afterRestore, setAfterRestore] = useState<{ from: string | null; left: number } | null>(null);

  const setStatus = useCallback((next: LibraryStatus) => {
    // An update that is running again behind the recovery screen does not take the screen away.
    if (next.state === "upgrading" && needsRecoveryScreen(current.current)) return;
    current.current = next;
    if (next.state !== "upgrading") setSeenSettled(true);
    setStatusState(next);
  }, []);

  const read = useCallback(async () => {
    try {
      const next = await bridge?.getState();
      if (next && live.current) setStatus(next);
      return next ?? null;
    } catch {
      // Not up yet: the next ask finds it.
      return null;
    }
  }, [bridge, setStatus]);

  useEffect(() => {
    live.current = true;
    void read();
    const off = bridge?.onStateChanged(() => void read());
    return () => {
      live.current = false;
      off?.();
    };
  }, [bridge, read]);

  // A restore ends wherever it was asked from: read the state again, and keep asking until it has moved.
  useEffect(() => {
    ensureRestoreWired();
    return onRestoreSettled((outcome) => {
      void read();
      if (outcome === "restored") setAfterRestore({ from: current.current?.computedAt ?? null, left: AFTER_RESTORE_TRIES });
    });
  }, [read]);

  // Until there is an answer, while the library is upgrading, and after a restore, ask again.
  const settled = status !== null && status.state !== "upgrading";
  const waitingForRestore = afterRestore !== null;
  useEffect(() => {
    if (!bridge || (settled && !waitingForRestore)) return;
    const timer = setInterval(() => {
      void read().then((next) => {
        setAfterRestore((now) => {
          if (!now) return now;
          const moved = next !== null && next.computedAt !== now.from;
          return moved || now.left <= 1 ? null : { ...now, left: now.left - 1 };
        });
      });
    }, ASK_MS);
    return () => clearInterval(timer);
  }, [bridge, settled, waitingForRestore, read]);

  // What the app said while the library could not be read (its first reads failed) is no longer true
  // once this screen shows, nor once the app comes back: closed on a real change, not at the start.
  const toast = useOptionalToast();
  const recovering = status !== null && needsRecoveryScreen(status);
  const upgradingScreen = status?.state === "upgrading" && !seenSettled && !waitExpired;
  const takeover = recovering || upgradingScreen;
  const was = useRef(takeover);
  const dismissAll = toast?.dismissAll;
  useEffect(() => {
    if (was.current !== takeover) dismissAll?.();
    was.current = takeover;
  }, [takeover, dismissAll]);

  // A wait screen that never ends (the engine died mid-update) gives way to the app after a ceiling.
  useEffect(() => {
    if (!upgradingScreen) return;
    const timer = setTimeout(() => setWaitExpired(true), WAIT_SCREEN_MAX_MS);
    return () => clearTimeout(timer);
  }, [upgradingScreen]);
  // A restore that worked leaves stale offers (an Undo for a change that is no longer there).
  useEffect(() => onRestoreSettled((outcome) => outcome === "restored" && dismissAll?.()), [dismissAll]);

  if (recovering && status !== null) {
    return <LibraryRecovery status={status} onState={setStatus} />;
  }
  if (upgradingScreen) return <LibraryUpgrading />;
  return <>{children}</>;
}
