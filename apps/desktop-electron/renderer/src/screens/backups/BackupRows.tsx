import type { BackupEntry } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { formatFileSize } from "../../format/units";
import { backupReason, backupWhen } from "./backupWords";
import "./backups.css";

/**
 * The backups, newest first: when, why in words, how big, and Restore (owner's pick: Restore only,
 * no Delete on a row; old copies are pruned, and Show in folder reaches the rest). Used by Settings
 * and by the recovery screen's choice.
 */
export function BackupRows({
  entries,
  onRestore,
  disabled = false,
  label = "Backups",
}: {
  entries: BackupEntry[];
  onRestore: (entry: BackupEntry) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <ul className="backup-list" aria-label={label}>
      {entries.map((entry) => {
        const when = backupWhen(entry.createdAt);
        return (
          <li className="backup-list__row" key={entry.name}>
            <span className="backup-list__when">{when}</span>
            <span className="backup-list__why">{backupReason(entry)}</span>
            <span className="backup-list__size">{formatFileSize(entry.bytes)}</span>
            <span className="backup-list__acts">
              <Button
                variant="secondary"
                size="sm"
                disabled={disabled}
                aria-label={`Restore the backup from ${when}`}
                onClick={() => onRestore(entry)}
              >
                Restore
              </Button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
