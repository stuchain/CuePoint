import { useCallback, useEffect, useState } from "react";

import type { BackupEntry, BackupList } from "../api/cuepointBridge.types";
import { needsDesktopApp, userMessage } from "../api/userMessage";
import { Button, EmptyState, Panel } from "../components";
import { BackupRows } from "./backups/BackupRows";
import { useRestoreFlow } from "./backups/useRestoreFlow";
import { SettingsActions, SettingsHint, SettingsStatus } from "./SettingsParts";

/** The one note under the title: when copies are made, and how many are kept. */
export const BACKUPS_NOTE =
  "Your library is backed up each time you open CuePoint after a change. The last 5 are kept, and the last 3 from before an update.";

/**
 * Settings › Backups (HARDEN-01, DEC-179, DEC-305): a note, Back up now and Show in folder, and the
 * backups with Restore on each. Restore asks first; while work runs the question names the work.
 */
export function BackupsSection() {
  const bridge = typeof window === "undefined" ? undefined : window.cuepoint?.backups;
  const [list, setList] = useState<BackupList | null>(null);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bridge) return;
    try {
      setList(await bridge.list());
      setLoadFailed(null);
    } catch (cause) {
      setLoadFailed(userMessage(cause, "CuePoint could not read the list of backups."));
    }
  }, [bridge]);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = useRestoreFlow({ onRestored: () => void load() });
  const holding = making || restore.restoring || restore.waitingLine !== null;

  const backUp = async () => {
    if (!bridge || holding) return;
    setMaking(true);
    setMade(false);
    setProblem(null);
    try {
      await bridge.create();
      setMade(true);
      await load();
    } catch (cause) {
      setProblem(userMessage(cause, "CuePoint could not make the backup."));
    } finally {
      setMaking(false);
    }
  };

  const showFolder = async () => {
    setProblem(null);
    try {
      const shown = await bridge?.showInFolder();
      if (shown === false) setProblem("CuePoint cannot show the backups folder yet. It is made with the first backup.");
    } catch (cause) {
      setProblem(userMessage(cause, "CuePoint could not show the backups folder."));
    }
  };

  const entries: BackupEntry[] = list?.backups ?? [];

  return (
    <Panel title="Backups">
      <div className="backups-section__top">
        <SettingsHint>{BACKUPS_NOTE}</SettingsHint>
        {bridge ? (
          <SettingsActions>
            <Button variant="primary" loading={making} disabled={holding} onClick={() => void backUp()}>
              Back up now
            </Button>
            <Button variant="secondary" onClick={() => void showFolder()}>
              Show in folder
            </Button>
          </SettingsActions>
        ) : (
          <SettingsHint>{needsDesktopApp("Backups")}</SettingsHint>
        )}
      </div>

      {/* The two places this section speaks are on the page from the start, empty, so a change is announced. */}
      <div className="backups-section__status" role="status" aria-live="polite">
        {restore.restoring && <SettingsStatus>Restoring your library…</SettingsStatus>}
        {!restore.restoring && restore.waitingLine && <SettingsStatus>{restore.waitingLine}</SettingsStatus>}
        {made && !problem && !restore.restoring && !restore.waitingLine && (
          <SettingsStatus tone="success">Backed up just now</SettingsStatus>
        )}
      </div>
      {restore.waitingLine && (
        <div className="backups-section__status">
          <Button variant="quiet" onClick={restore.stopWaiting}>
            Cancel restore
          </Button>
        </div>
      )}
      <div className="backups-section__status" role="alert">
        {(problem || restore.error || loadFailed) && (
          <SettingsStatus tone="danger">{problem ?? restore.error ?? loadFailed}</SettingsStatus>
        )}
      </div>

      {bridge && list && entries.length === 0 && <EmptyState compact headline="No backups yet" />}
      {entries.length > 0 && <BackupRows entries={entries} disabled={holding} onRestore={restore.ask} />}
      {restore.dialog}
    </Panel>
  );
}
