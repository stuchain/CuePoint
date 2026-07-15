import { useEffect, useState } from "react";
import { Modal } from "./index";
import "./PrivacyDialog.css";

const STORAGE_CLEAR_CACHE = "cuepoint-privacy-clear-cache-on-exit";
const STORAGE_CLEAR_LOGS = "cuepoint-privacy-clear-logs-on-exit";

const PRIVACY_TEXT = `CuePoint respects your privacy.

Data collection:
- No telemetry or analytics in v1.0
- No background data collection

Network requests:
- Beatport scraping/search: user-initiated only
- Update checking: optional (future integration)

Local storage:
- Match history CSV exports and configuration on disk
- Beatport token stored locally when configured
- Logs and cache for debugging (can be cleared)

You can adjust exit preferences below. Clearing cache or logs from Settings may be added in a future update.`;

interface PrivacyDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PrivacyDialog({ open, onClose }: PrivacyDialogProps) {
  const [clearCacheOnExit, setClearCacheOnExit] = useState(false);
  const [clearLogsOnExit, setClearLogsOnExit] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClearCacheOnExit(localStorage.getItem(STORAGE_CLEAR_CACHE) === "1");
    setClearLogsOnExit(localStorage.getItem(STORAGE_CLEAR_LOGS) === "1");
  }, [open]);

  const handleSave = () => {
    localStorage.setItem(STORAGE_CLEAR_CACHE, clearCacheOnExit ? "1" : "0");
    localStorage.setItem(STORAGE_CLEAR_LOGS, clearLogsOnExit ? "1" : "0");
    onClose();
  };

  return (
    <Modal
      open={open}
      title="Privacy"
      onClose={onClose}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
      primaryAction={{ label: "Save", onClick: handleSave }}
    >
      <div className="privacy-dialog">
        <pre className="privacy-dialog__text">{PRIVACY_TEXT}</pre>
        <fieldset className="privacy-dialog__prefs">
          <legend>On exit</legend>
          <label>
            <input
              type="checkbox"
              checked={clearCacheOnExit}
              onChange={(e) => setClearCacheOnExit(e.target.checked)}
            />
            Clear cache on exit
          </label>
          <label>
            <input
              type="checkbox"
              checked={clearLogsOnExit}
              onChange={(e) => setClearLogsOnExit(e.target.checked)}
            />
            Clear logs on exit
          </label>
        </fieldset>
      </div>
    </Modal>
  );
}
