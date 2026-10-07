import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { settingsFocusState } from "../screens/settingsLink";
import { Button, Modal, useToast } from "./index";
import { reportUnexpected } from "../reporting/reporting";
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

You can adjust exit preferences below. You can clear cache/logs now, and optionally
clear them automatically on exit.`;

interface PrivacyDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PrivacyDialog({ open, onClose }: PrivacyDialogProps) {
  const [clearCacheOnExit, setClearCacheOnExit] = useState(false);
  const [clearLogsOnExit, setClearLogsOnExit] = useState(false);
  const [clearing, setClearing] = useState(false);
  // What the bridge said about error reports (REPORT-01): nothing yet, on or
  // off, or that it could not be read.
  const [reporting, setReporting] = useState<boolean | "unreadable" | null>(null);
  const { push } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    let live = true;
    setReporting(null);
    window.cuepoint?.errorReporting
      ?.get()
      .then((state) => {
        if (live) setReporting(state.enabled);
      })
      .catch(() => {
        if (live) setReporting("unreadable");
      });
    return () => {
      live = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setClearCacheOnExit(localStorage.getItem(STORAGE_CLEAR_CACHE) === "1");
    setClearLogsOnExit(localStorage.getItem(STORAGE_CLEAR_LOGS) === "1");
  }, [open]);

  const handleSave = () => {
    localStorage.setItem(STORAGE_CLEAR_CACHE, clearCacheOnExit ? "1" : "0");
    localStorage.setItem(STORAGE_CLEAR_LOGS, clearLogsOnExit ? "1" : "0");
    void window.cuepoint?.setPrivacyExitPrefs?.({
      clearCacheOnExit,
      clearLogsOnExit,
    });
    onClose();
  };

  const handleClearCacheNow = async () => {
    if (!window.cuepoint?.clearCuepointCache) return;
    const ok = window.confirm("Clear cache now? This may improve privacy at the cost of performance.");
    if (!ok) return;
    setClearing(true);
    try {
      await window.cuepoint.clearCuepointCache();
      push("Cache cleared.", "success");
    } catch (e) {
      reportUnexpected(e);
      push(e instanceof Error ? e.message : "Failed to clear cache.", "warning");
    } finally {
      setClearing(false);
    }
  };

  const handleClearLogsNow = async () => {
    if (!window.cuepoint?.clearCuepointLogs) return;
    const ok = window.confirm("Clear logs now? This cannot be undone.");
    if (!ok) return;
    setClearing(true);
    try {
      await window.cuepoint.clearCuepointLogs();
      push("Logs cleared.", "success");
    } catch (e) {
      reportUnexpected(e);
      push(e instanceof Error ? e.message : "Failed to clear logs.", "warning");
    } finally {
      setClearing(false);
    }
  };

  const handleChangeInSettings = () => {
    onClose();
    navigate("/settings", { state: settingsFocusState("error-reporting") });
  };

  let reportingWords = "Error reports: …";
  if (!window.cuepoint?.errorReporting) reportingWords = "Error reports: unavailable outside the desktop app";
  else if (reporting === "unreadable") reportingWords = "Error reports: could not be read";
  else if (reporting !== null) reportingWords = `Error reports: ${reporting ? "on" : "off"}`;

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
        <p className="privacy-dialog__reporting">
          <span data-testid="privacy-error-reports">{reportingWords}</span>{" "}
          <button type="button" className="privacy-dialog__link" onClick={handleChangeInSettings}>
            Change in Settings
          </button>
        </p>
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

        <div className="privacy-dialog__actions">
          <Button
            variant="secondary"
            loading={clearing}
            disabled={clearing}
            onClick={() => void handleClearCacheNow()}
          >
            Clear cache now
          </Button>
          <Button
            variant="secondary"
            loading={clearing}
            disabled={clearing}
            onClick={() => void handleClearLogsNow()}
          >
            Clear logs now
          </Button>
        </div>
      </div>
    </Modal>
  );
}
