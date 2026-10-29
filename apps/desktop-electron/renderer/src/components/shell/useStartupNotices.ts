/**
 * The notes the status strip says once at start (HARDEN-03, HARDEN-05, DEC-305), quietly, in the
 * place of "Ready":
 *
 * - the window was stopped and reopened (main says so once, and again if it happens while the page
 *   is listening);
 * - the last session did not end properly, and the check of the library passed;
 * - an export was interrupted when CuePoint stopped, and nothing was written.
 *
 * A failed check is not a note: the library's state becomes damaged and the recovery screen shows.
 */
import { useEffect } from "react";

import { restoreSeen } from "../../screens/backups/restoreStore";
import {
  EXPORT_INTERRUPTED_WORDS,
  UNCLEAN_EXIT_WORDS,
  showStripNotice,
} from "../../api/stripMessages";

const ASK_MS = 2000;
/** The check of a large library can take a while: after this many asks the asking slows down, but never stops. */
const QUICK_ASKS = 30;
const SLOW_ASK_MS = 10_000;
/** An interruption is "from start" when the job was marked in the last few minutes. */
const RECENT_MS = 10 * 60_000;
const LIST_TRIES = 15;
const SEEN_KEY = "cuepoint-interrupted-exports-told";
const UNCLEAN_KEY = "cuepoint-unclean-exit-told";

function seen(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function remember(ids: string[]): void {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen(), ...ids]));
  } catch {
    // Told again after a reload at worst.
  }
}

function uncleanTold(): boolean {
  try {
    return sessionStorage.getItem(UNCLEAN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberUnclean(): void {
  try {
    sessionStorage.setItem(UNCLEAN_KEY, "1");
  } catch {
    // Told again after a reload at worst.
  }
}

/** Told once in this run of the app, wherever the shell is mounted again. */
let exportTold = false;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useStartupNotices(): void {
  useEffect(() => {
    let live = true;
    const bridge = window.cuepoint;

    // The window was reopened.
    void bridge?.windowRecovery
      ?.take()
      .then((message) => {
        if (live && message) showStripNotice(message);
      })
      .catch(() => undefined);
    const offReopened = bridge?.windowRecovery?.onReopened((message) => showStripNotice(message));

    // The last session did not end properly, and the check found the library fine.
    void (async () => {
      try {
        if (uncleanTold() || !(await bridge?.library?.getUncleanExit())) return;
      } catch {
        return;
      }
      for (let tries = 0; live; tries += 1) {
        try {
          const status = await bridge?.library?.getState();
          const check = status?.integrityCheck.state;
          if (check === "ok") {
            rememberUnclean();
            showStripNotice(UNCLEAN_EXIT_WORDS);
            return;
          }
          if (check === "failed" || (status && status.state !== "ok" && status.state !== "upgrading")) return;
        } catch {
          // Not up yet.
        }
        await pause(tries < QUICK_ASKS ? ASK_MS : SLOW_ASK_MS);
      }
    })();

    // An export was interrupted: the job was marked so when CuePoint started again.
    void (async () => {
      for (let tries = 0; tries < LIST_TRIES && live && !exportTold; tries += 1) {
        try {
          const list = await bridge?.listJobs?.({ state: "all", limit: 50 });
          if (!list) return;
          const told = seen();
          const found = list.jobs.filter(
            (job) =>
              job.type === "rekordbox_export" &&
              job.error?.code === "JOB_INTERRUPTED" &&
              Date.now() - Date.parse(job.updated_at) < RECENT_MS &&
              !told.includes(job.id),
          );
          // After a restore in this run the jobs listed are the restored library's, not an interruption.
          if (found.length > 0 && !restoreSeen()) {
            exportTold = true;
            remember(found.map((job) => job.id));
            if (live) showStripNotice(EXPORT_INTERRUPTED_WORDS);
          }
          return;
        } catch {
          await pause(ASK_MS);
        }
      }
    })();

    return () => {
      live = false;
      offReopened?.();
    };
  }, []);
}

/** Back to the start; for tests. */
export function resetStartupNoticesForTests(): void {
  exportTold = false;
}
