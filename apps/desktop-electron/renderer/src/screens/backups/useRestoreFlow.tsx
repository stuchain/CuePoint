/**
 * Restoring a backup, as Settings › Backups and the recovery screen both do it (HARDEN-01, DEC-173).
 *
 * `ask(backup)` opens "Restore this backup?". Restore asks main to stop CuePoint's work, put the
 * library back and start the work again; main refuses with `WORK_RUNNING` when something is running,
 * and the question then names the work and offers, in the order the dialogs have everywhere
 * (extra at the left, Cancel, the main button at the right): **Stop it and restore now**, Cancel,
 * **Restore when done** (owner's picks, DEC-305). Waiting is this page's: it watches the running
 * work and restores when it has ended. A restore that ends (`restored`) makes every view read the
 * library again.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { reloadEveryView } from "../../api/reloadEveryView";
import { userMessage } from "../../api/userMessage";
import type { BackupEntry, BackupRunningWork, EngineJobSummary } from "../../api/cuepointBridge.types";
import { Modal } from "../../components/Modal";
import { backupMoment, restoreClause, workNoun, workProgress } from "./backupWords";

const WAIT_POLL_MS = 2000;
const SAFETY_HINT = "Your library as it is now is kept as a backup first, so you can come back to it.";

type Phase =
  | { kind: "idle" }
  | { kind: "asking"; entry: BackupEntry; pending: boolean }
  | { kind: "busy"; entry: BackupEntry; running: BackupRunningWork[]; jobs: EngineJobSummary[]; pending: boolean }
  | { kind: "waiting"; entry: BackupEntry; work: string };

export interface RestoreFlow {
  /** Open the question for this backup. */
  ask: (entry: BackupEntry) => void;
  /** The dialogs; render once, anywhere. */
  dialog: ReactNode;
  /** "Restoring when the import finishes": set while waiting for work to end, else null. */
  waitingLine: string | null;
  /** Stop waiting for the work to end. */
  stopWaiting: () => void;
  /** A restore is going on (main has stopped CuePoint's work, or the call is out). */
  restoring: boolean;
  /** Why the last restore did not happen, in words; null otherwise. */
  error: string | null;
  clearError: () => void;
}

function bridge() {
  return typeof window === "undefined" ? undefined : window.cuepoint?.backups;
}

/** "An import is running (312 of 2,400 tracks)" and what follows, for one or several. */
function describeWork(running: BackupRunningWork[], jobs: EngineJobSummary[]): { head: string; rest: string; waiting: string } {
  if (running.length > 1) {
    return {
      head: `${running.length} things are running`,
      rest: " Restore when they're done, or stop them and restore now.",
      waiting: "CuePoint's current work",
    };
  }
  const only = running[0];
  const noun = workNoun(only?.type);
  const job = jobs.find((candidate) => candidate.id === only?.id);
  const progress = workProgress(job?.progress?.completed_tracks, job?.progress?.total_tracks);
  return {
    head: `${noun} is running`,
    rest: `${progress ? ` ${progress}.` : "."} Restore when it's done, or stop it and restore now.`,
    waiting: noun,
  };
}

export function useRestoreFlow(options: { onRestored?: () => void } = {}): RestoreFlow {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onRestored = useRef(options.onRestored);
  onRestored.current = options.onRestored;
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // What main says as it goes. `restored` is the cue to read everything again.
  useEffect(() => {
    return bridge()?.onRestoreEvent((event) => {
      if (event.phase === "restored") {
        setRestoring(false);
        reloadEveryView();
        onRestored.current?.();
      } else if (event.phase === "failed") {
        setRestoring(false);
        setError(event.message);
      } else {
        setRestoring(true);
      }
    });
  }, []);

  const readJobs = useCallback(async (): Promise<EngineJobSummary[]> => {
    try {
      const list = window.cuepoint?.listJobs;
      if (!list) return [];
      return (await list({ state: "active", limit: 5 })).jobs;
    } catch {
      return [];
    }
  }, []);

  /** Ask main to restore; `cancelRunning` stops work through its own cancel. */
  const run = useCallback(
    async (entry: BackupEntry, cancelRunning: boolean) => {
      const api = bridge();
      if (!api) return;
      setError(null);
      try {
        const result = await api.restore(entry.name, cancelRunning ? { cancelRunning: true } : undefined);
        if (!live.current) return;
        if (result.ok) {
          setPhase({ kind: "idle" });
          setRestoring(false);
          reloadEveryView();
          onRestored.current?.();
          return;
        }
        if (result.errorCode === "WORK_RUNNING") {
          const running = result.running ?? [];
          const jobs = await readJobs();
          if (live.current) setPhase({ kind: "busy", entry, running, jobs, pending: false });
          return;
        }
        setPhase({ kind: "idle" });
        setError(result.message);
      } catch (cause) {
        if (!live.current) return;
        setPhase({ kind: "idle" });
        setError(userMessage(cause, "Your library was not changed."));
      }
    },
    [readJobs],
  );

  // "Restore when done": watch the work and restore when none is left.
  const waitingFor = phase.kind === "waiting" ? phase.entry : null;
  useEffect(() => {
    if (!waitingFor) return;
    let stopped = false;
    let ticking = false;
    const tick = async () => {
      if (ticking || stopped) return;
      ticking = true;
      try {
        const list = window.cuepoint?.listJobs;
        const active = list ? (await list({ state: "active", limit: 1 })).active_count : 0;
        if (stopped) return;
        if (active === 0) {
          stopped = true;
          await run(waitingFor, false);
        }
      } catch {
        // Not read this time; the next tick asks again.
      } finally {
        ticking = false;
      }
    };
    const timer = setInterval(() => void tick(), WAIT_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [waitingFor, run]);

  const ask = useCallback((entry: BackupEntry) => {
    setError(null);
    setPhase({ kind: "asking", entry, pending: false });
  }, []);

  const close = () => setPhase({ kind: "idle" });

  let dialog: ReactNode = null;
  if (phase.kind === "asking" || phase.kind === "busy") {
    const entry = phase.entry;
    const moment = backupMoment(entry.createdAt);
    const busy = phase.kind === "busy";
    const work = busy ? describeWork(phase.running, phase.jobs) : null;
    dialog = (
      <Modal
        open
        size="medium"
        title="Restore this backup?"
        onClose={close}
        closeDisabled={phase.pending}
        extraAction={
          busy
            ? {
                label: "Stop it and restore now",
                disabled: phase.pending,
                onClick: () => {
                  setPhase({ ...phase, pending: true });
                  void run(entry, true);
                },
              }
            : undefined
        }
        secondaryAction={{ label: "Cancel", onClick: close, disabled: phase.pending }}
        primaryAction={
          busy
            ? {
                label: "Restore when done",
                disabled: phase.pending,
                onClick: () => setPhase({ kind: "waiting", entry, work: work?.waiting ?? "CuePoint's current work" }),
              }
            : {
                label: "Restore",
                loading: phase.pending,
                onClick: () => {
                  setPhase({ ...phase, pending: true });
                  void run(entry, false);
                },
              }
        }
      >
        <p>{`Your library goes back to how it was on ${moment}${busy ? "" : restoreClause(entry)}.`}</p>
        {work && (
          <p>
            <strong>{work.head}</strong>
            {work.rest}
          </p>
        )}
        <p className="cp-field__hint">{SAFETY_HINT}</p>
      </Modal>
    );
  }

  const waitingLine =
    phase.kind === "waiting"
      ? `Restores when ${phase.work.startsWith("CuePoint") ? phase.work : `${phase.work.charAt(0).toLowerCase()}${phase.work.slice(1)}`} finishes`
      : null;

  return {
    ask,
    dialog,
    waitingLine,
    stopWaiting: () => setPhase((now) => (now.kind === "waiting" ? { kind: "idle" } : now)),
    restoring,
    error,
    clearError: () => setError(null),
  };
}
