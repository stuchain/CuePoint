import { useSyncExternalStore } from "react";

import {
  cancelRestart,
  getRestartSnapshot,
  requestRestart,
  restartNow,
  restartWhenDone,
  stopWaiting,
  subscribeRestart,
} from "./restartStore";

/** The restart flow (DEC-173) as the screens read it; the state is the page-wide store's. */
export interface RestartFlow {
  /** The work that is running, in a few words ("Importing"); null when unknown. */
  work: string | null;
  /** The question is showing. */
  confirming: boolean;
  /** CuePoint could not tell whether work is running. */
  unknown: boolean;
  /** Restart when the work ends has been chosen. */
  waiting: boolean;
  request: () => void;
  restartNow: () => void;
  restartWhenDone: () => void;
  cancel: () => void;
  stopWaiting: () => void;
}

export function useRestartFlow(): RestartFlow {
  const snapshot = useSyncExternalStore(subscribeRestart, getRestartSnapshot);
  return {
    work: snapshot.work,
    confirming: snapshot.phase === "confirming",
    unknown: snapshot.unknown,
    waiting: snapshot.phase === "waiting",
    request: () => void requestRestart(),
    restartNow,
    restartWhenDone,
    cancel: cancelRestart,
    stopWaiting,
  };
}
