import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import appIcon from "../../assets/cuepoint-icon.png";
import type { BackupEntry, LibraryStatus } from "../../api/cuepointBridge.types";
import { reloadEveryView } from "../../api/reloadEveryView";
import { userMessage } from "../../api/userMessage";
import { Button } from "../../components/Button";
import { GetHelpDialog } from "../../components/GetHelpDialog";
import { Notice } from "../../components/Notice";
import { ScreenHeader } from "../../components/shell/ScreenHeader";
import { BackupRows } from "../backups/BackupRows";
import { backupWhenInSentence } from "../backups/backupWords";
import "../backups/backups.css";
import "./recovery.css";

const MB = 1024 * 1024;
const STEP_MB = 100;
/** How often "Try again" asks whether the library's state has settled, and for how long. */
const SETTLE_POLL_MS = 1000;
const SETTLE_TRIES = 30;

/** "300": how many MB must be free, rounded up to the next 100 so the promise is never short. */
export function megabytesNeeded(bytes: number | null): number {
  if (bytes === null || !(bytes > 0)) return STEP_MB;
  return Math.max(STEP_MB, Math.ceil(bytes / MB / STEP_MB) * STEP_MB);
}

/**
 * Where the library file is, from where the backups are kept (one folder beside it). Null when the
 * backups folder is not one this can read the library from.
 */
export function libraryFileFrom(backupsFolder: string | null): string | null {
  if (!backupsFolder) return null;
  const match = /^(.*?)([\\/])backups[\\/]?$/.exec(backupsFolder);
  return match ? `${match[1]}${match[2]}cuepoint.db` : null;
}

type Screen = "message" | "choose";

interface Words {
  title: string;
  text: string;
}

/** The title and sentence for each state the screen answers (owner's mockups, DEC-305). */
export function recoveryWords(status: LibraryStatus): Words {
  switch (status.state) {
    case "too_new": {
      const newer = status.libraryVersion ? `CuePoint ${status.libraryVersion}` : "a newer CuePoint";
      return {
        title: "This library is from a newer CuePoint",
        text: `It was last opened by ${newer}, and this is ${status.appVersion}. Install the newer version, or restore a backup from before it.`,
      };
    }
    case "upgrade_failed": {
      const copy = status.preUpgradeBackup ? backupWhenInSentence(status.preUpgradeBackup.createdAt) : "";
      return {
        title: "CuePoint couldn't finish updating your library",
        text: copy
          ? `Nothing was lost: a copy from just before the update is kept (${copy}).`
          : "Nothing was lost.",
      };
    }
    case "needs_space":
      return {
        title: "CuePoint needs more space to update your library",
        text: `About ${megabytesNeeded(status.requiredFreeBytes)} MB must be free to keep a copy of your library before the update. Free some space, then try again.`,
      };
    default: {
      const good = status.newestGoodBackup ? backupWhenInSentence(status.newestGoodBackup.createdAt) : "";
      return {
        title: "CuePoint couldn't read your library",
        text: good
          ? `Something damaged the file your library is kept in. Your latest good backup is from ${good}.`
          : "Something damaged the file your library is kept in. CuePoint found no backup it can use.",
      };
    }
  }
}

/**
 * The full-window screen shown instead of the app when the library cannot be used (HARDEN-03,
 * DEC-182): damaged, from a newer CuePoint, an update that failed, or an update that needs room.
 * Each says what happened in a sentence and offers the way back. `onState` hands up a state that
 * has changed (a restore or "Try again" settled); the app shows the library again when it is ok.
 */
export function LibraryRecovery({
  status,
  onState,
  settlePollMs = SETTLE_POLL_MS,
}: {
  status: LibraryStatus;
  onState: (next: LibraryStatus) => void;
  settlePollMs?: number;
}) {
  const [screen, setScreen] = useState<Screen>("message");
  const [backups, setBackups] = useState<BackupEntry[] | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [working, setWorking] = useState<"restore" | "retry" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const words = recoveryWords(status);
  const bridge = window.cuepoint;

  /** Ask for the state until it differs from the one on screen, or give up. */
  const settle = useCallback(async () => {
    for (let tries = 0; tries < SETTLE_TRIES && live.current; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, settlePollMs));
      try {
        const next = await bridge?.library?.getState();
        if (next && live.current && (next.computedAt !== status.computedAt || next.state !== status.state)) {
          onState(next);
          return;
        }
      } catch {
        // The background process is still coming up; ask again.
      }
    }
  }, [bridge, onState, settlePollMs, status.computedAt, status.state]);

  const restore = async (name: string) => {
    const backups = bridge?.backups;
    if (!backups || working) return;
    setWorking("restore");
    setProblem(null);
    try {
      const result = await backups.restore(name);
      if (!live.current) return;
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      reloadEveryView();
      await settle();
    } catch (cause) {
      if (live.current) setProblem(userMessage(cause, "Your library was not changed."));
    } finally {
      if (live.current) setWorking(null);
    }
  };

  const tryAgain = async () => {
    if (working) return;
    setWorking("retry");
    setProblem(null);
    try {
      await bridge?.library?.recheck();
      await settle();
    } catch (cause) {
      if (live.current) setProblem(userMessage(cause, "CuePoint couldn't check your library."));
    } finally {
      if (live.current) setWorking(null);
    }
  };

  const choose = async () => {
    setScreen("choose");
    setProblem(null);
    try {
      const found = await bridge?.backups?.list();
      if (!live.current) return;
      setBackups(found?.backups ?? []);
      setFolder(found?.folder ?? null);
    } catch (cause) {
      if (live.current) {
        setBackups([]);
        setProblem(userMessage(cause, "CuePoint couldn't read the list of backups."));
      }
    }
  };

  const showLibraryFile = async () => {
    setProblem(null);
    try {
      let where = folder;
      if (where === null) where = (await bridge?.backups?.list())?.folder ?? null;
      const file = libraryFileFrom(where);
      if (file && bridge?.showItemInFolder) await bridge.showItemInFolder(file);
      else await bridge?.backups?.showInFolder();
    } catch (cause) {
      if (live.current) setProblem(userMessage(cause, "CuePoint couldn't show the library file."));
    }
  };

  const getLatest = async () => {
    try {
      const opened = await bridge?.updates?.openReleasePage("update");
      if (!opened) await bridge?.updates?.openReleasePage("current");
    } catch (cause) {
      if (live.current) setProblem(userMessage(cause, "CuePoint couldn't open the download page."));
    }
  };

  const busy = working !== null;
  const way = status.state === "upgrade_failed" ? status.preUpgradeBackup : status.newestGoodBackup;

  const report = (
    <Button key="report" variant="quiet" onClick={() => setReporting(true)} disabled={busy}>
      Report this problem
    </Button>
  );

  let buttons: ReactNode[] = [];
  if (screen === "choose") {
    buttons = [
      <Button key="back" variant="secondary" onClick={() => setScreen("message")} disabled={busy}>
        Back
      </Button>,
    ];
  } else if (status.state === "too_new") {
    buttons = [
      <Button key="latest" variant="primary" onClick={() => void getLatest()}>
        Get the latest CuePoint
      </Button>,
      <Button key="choose" variant="secondary" onClick={() => void choose()}>
        Choose a backup
      </Button>,
    ];
  } else if (status.state === "upgrade_failed") {
    buttons = [
      <Button key="retry" variant="primary" loading={working === "retry"} disabled={busy} onClick={() => void tryAgain()}>
        Try again
      </Button>,
      ...(way
        ? [
            <Button key="copy" variant="secondary" loading={working === "restore"} disabled={busy} onClick={() => void restore(way.name)}>
              Restore that copy
            </Button>,
          ]
        : []),
      report,
    ];
  } else if (status.state === "needs_space") {
    buttons = [
      <Button key="retry" variant="primary" loading={working === "retry"} disabled={busy} onClick={() => void tryAgain()}>
        Try again
      </Button>,
    ];
  } else {
    buttons = [
      ...(way
        ? [
            <Button key="restore" variant="primary" loading={working === "restore"} disabled={busy} onClick={() => void restore(way.name)}>
              Restore this backup
            </Button>,
          ]
        : []),
      <Button key="choose" variant={way ? "secondary" : "primary"} disabled={busy} onClick={() => void choose()}>
        Choose another backup
      </Button>,
      <Button key="file" variant="secondary" disabled={busy} onClick={() => void showLibraryFile()}>
        Show the library file
      </Button>,
      report,
    ];
  }

  return (
    <div className="library-recovery" data-state={status.state}>
      <div className="library-recovery__brand">
        <img className="library-recovery__logo" src={appIcon} alt="" draggable={false} />
        <span>CuePoint</span>
      </div>
      <main className="library-recovery__card">
        <ScreenHeader title={words.title} />
        {screen === "choose" ? (
          <>
            <p className="library-recovery__text">
              Choose the backup to restore. Your library file as it is now is set aside first.
            </p>
            {backups === null ? (
              <p className="library-recovery__text">Reading your backups…</p>
            ) : backups.length === 0 ? (
              <p className="library-recovery__text">There are no backups to restore.</p>
            ) : (
              <BackupRows entries={backups} disabled={busy} onRestore={(entry) => void restore(entry.name)} />
            )}
          </>
        ) : (
          <p className="library-recovery__text">{words.text}</p>
        )}
        {working === "restore" && (
          <p className="library-recovery__text" role="status">
            Restoring your library…
          </p>
        )}
        {problem && <Notice kind="danger">{problem}</Notice>}
        <div className="library-recovery__buttons">{buttons}</div>
      </main>
      <GetHelpDialog open={reporting} onClose={() => setReporting(false)} />
    </div>
  );
}

