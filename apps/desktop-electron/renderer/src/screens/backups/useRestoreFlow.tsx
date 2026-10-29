/**
 * Restoring a backup, as Settings › Backups and the recovery screen both do it (HARDEN-01, DEC-173).
 *
 * `ask(backup)` opens "Restore this backup?". Restore asks main to stop CuePoint's work, put the
 * library back and start the work again; main refuses with `WORK_RUNNING` when something is running,
 * and the question then names the work and offers, in the order the dialogs have everywhere
 * (extra at the left, Cancel, the main button at the right): **Stop it and restore now**, Cancel,
 * **Restore when done** (owner's picks, DEC-305). The waiting, main's progress and the result live
 * in `restoreStore`, above every page, so they carry on while Settings is not the page shown.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import type { BackupEntry, BackupRunningWork, EngineJobSummary } from "../../api/cuepointBridge.types";
import { Modal } from "../../components/Modal";
import { backupMoment, restoreClause, workNoun, workProgress } from "./backupWords";
import {
  clearRestoreError,
  ensureRestoreWired,
  getRestoreSnapshot,
  onRestoreSettled,
  runRestore,
  stopWaiting,
  subscribeRestore,
  waitThenRestore,
} from "./restoreStore";

const SAFETY_HINT = "Your library as it is now is kept as a backup first, so you can come back to it.";

type Phase =
  | { kind: "idle" }
  | { kind: "asking"; entry: BackupEntry; pending: boolean }
  | { kind: "busy"; entry: BackupEntry; running: BackupRunningWork[]; jobs: EngineJobSummary[]; pending: boolean };

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

/** "An import is running (312 of 2,400 tracks)" and what follows, for one or several. */
function describeWork(running: BackupRunningWork[], jobs: EngineJobSummary[]): { head: string; rest: string; waiting: string } {
  if (running.length > 1) {
    return {
      head: `${running.length} things are running`,
      rest: " Restore when they are done, or stop them and restore now.",
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
  const store = useSyncExternalStore(subscribeRestore, getRestoreSnapshot);
  const onRestored = useRef(options.onRestored);
  onRestored.current = options.onRestored;
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    ensureRestoreWired();
    // A restore that ended while this page was hidden is told when it is next shown (the list reads again).
    const off = onRestoreSettled((outcome) => {
      if (outcome === "restored") onRestored.current?.();
    });
    return () => {
      live.current = false;
      off();
    };
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

  const run = useCallback(
    async (entry: BackupEntry, cancelRunning: boolean) => {
      const result = await runRestore(entry, cancelRunning);
      if (!live.current) return;
      if (result && !result.ok && result.errorCode === "WORK_RUNNING") {
        const running = result.running ?? [];
        const jobs = await readJobs();
        if (live.current) setPhase({ kind: "busy", entry, running, jobs, pending: false });
        return;
      }
      setPhase({ kind: "idle" });
    },
    [readJobs],
  );

  const ask = useCallback((entry: BackupEntry) => {
    clearRestoreError();
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
                onClick: () => {
                  waitThenRestore(entry, work?.waiting ?? "Background work");
                  setPhase({ kind: "idle" });
                },
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

  return {
    ask,
    dialog,
    waitingLine: store.waiting?.line ?? null,
    stopWaiting,
    restoring: store.restoring,
    error: store.error,
    clearError: clearRestoreError,
  };
}
