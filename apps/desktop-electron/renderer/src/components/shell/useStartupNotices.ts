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

import {
  EXPORT_INTERRUPTED_WORDS,
  UNCLEAN_EXIT_WORDS,
  showStripNotice,
} from "../../api/stripMessages";

const ASK_MS = 2000;
/** How long the library's check is waited for after an unclean exit. */
const CHECK_TRIES = 90;
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
      for (let tries = 0; tries < CHECK_TRIES && live; tries += 1) {
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
        await pause(ASK_MS);
      }
    })();

    // An export was interrupted: the job was marked so when CuePoint started again.
    void (async () => {
      for (let tries = 0; tries < LIST_TRIES && live; tries += 1) {
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
          if (found.length > 0) {
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
