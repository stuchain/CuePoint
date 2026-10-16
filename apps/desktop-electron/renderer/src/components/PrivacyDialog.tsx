import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { settingsFocusState } from "../screens/settingsLink";
import { Button, Modal, useToast } from "./index";
import { ConfirmDialog } from "./ConfirmDialog";
import { LinkButton } from "./LinkButton";
import { reportUnexpected } from "../reporting/reporting";
import "./PrivacyDialog.css";
import { userMessage } from "../api/userMessage";

const PRIVACY_TEXT = `CuePoint respects your privacy.

Data collection:
- No analytics or usage tracking
- Error reports: when CuePoint hits an unexpected error, a released build sends a report to Sentry (EU region) unless you turn it off. Reports are cleaned on your computer so they do not include file, folder, track, artist, label or playlist names, the notes and tags you keep in CuePoint, or your Beatport sign-in. The Privacy Notice says what a report carries and how long it is kept.

Network requests:
- Beatport scraping/search: user-initiated only
- Updates: the installed app checks GitHub for updates at launch and every 4 hours, and downloads a new version from there. A check sends only what any download sends, with no id, no account and nothing from your library. You can also check in Settings → About & updates.

Local storage:
- Match history CSV exports and configuration on disk
- Your Beatport sign-in stored locally when you sign in
- Logs and cache for debugging (can be cleared)

You can clear the cache and the logs now. Whether CuePoint sends error reports, and whether
it clears the cache and logs when it quits, are chosen in Settings → Privacy.`;

interface PrivacyDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PrivacyDialog({ open, onClose }: PrivacyDialogProps) {
  const [clearing, setClearing] = useState(false);
  // What the bridge said about error reports (REPORT-01): nothing yet, on or
  // off, or that it could not be read.
  const [reporting, setReporting] = useState<boolean | "unreadable" | "unconfigured" | null>(null);
  const { push } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    let live = true;
    setReporting(null);
    window.cuepoint?.errorReporting
      ?.get()
      .then((state) => {
        if (live) setReporting(state.configured === false ? "unconfigured" : state.enabled);
      })
      .catch(() => {
        if (live) setReporting("unreadable");
      });
    return () => {
      live = false;
    };
  }, [open]);

  // Which clear is being asked about: an app dialog, never window.confirm.
  const [asking, setAsking] = useState<"cache" | "logs" | null>(null);

  const handleClearCacheNow = async () => {
    if (!window.cuepoint?.clearCuepointCache) return;
    setAsking(null);
    setClearing(true);
    try {
      await window.cuepoint.clearCuepointCache();
      push("Cache cleared.", "success");
    } catch (e) {
      reportUnexpected(e);
      push(userMessage(e, "Failed to clear cache."), "warning");
    } finally {
      setClearing(false);
    }
  };

  const handleClearLogsNow = async () => {
    if (!window.cuepoint?.clearCuepointLogs) return;
    setAsking(null);
    setClearing(true);
    try {
      await window.cuepoint.clearCuepointLogs();
      push("Logs cleared.", "success");
    } catch (e) {
      reportUnexpected(e);
      push(userMessage(e, "Failed to clear logs."), "warning");
    } finally {
      setClearing(false);
    }
  };

  // The one home of these choices is Settings → Privacy (SET-7).
  const handleChangeInSettings = () => {
    onClose();
    navigate("/settings", { state: settingsFocusState("privacy") });
  };

  // The switch's state, then where to change it (the notice's "Settings → Privacy → Send error reports").
  let reportingWords = "Error reports: …";
  if (!window.cuepoint?.errorReporting) reportingWords = "Error reports: unavailable outside the desktop app";
  else if (reporting === "unconfigured") reportingWords = "Error reports: not available in this build (nothing is sent)";
  else if (reporting === "unreadable") reportingWords = "Error reports: could not be read";
  else if (reporting !== null) reportingWords = `Error reports: ${reporting ? "on" : "off"}`;

  return (
    <>
    <Modal
      open={open}
      title="Privacy"
      onClose={onClose}
      closeLabel="Close"
    >
      <div className="privacy-dialog">
        <pre className="privacy-dialog__text">{PRIVACY_TEXT}</pre>
        <p className="privacy-dialog__reporting">
          <span data-testid="privacy-error-reports">{reportingWords}</span>{" "}
          <LinkButton className="privacy-dialog__link" onClick={handleChangeInSettings}>
            Change these in Settings → Privacy
          </LinkButton>
        </p>

        <div className="privacy-dialog__actions">
          <Button
            variant="secondary"
            loading={clearing}
            disabled={clearing}
            onClick={() => setAsking("cache")}
          >
            Clear cache now…
          </Button>
          <Button
            variant="danger"
            loading={clearing}
            disabled={clearing}
            onClick={() => setAsking("logs")}
          >
            Clear logs now…
          </Button>
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      open={asking === "cache"}
      title="Clear cache?"
      confirmLabel="Clear cache"
      onConfirm={() => void handleClearCacheNow()}
      onCancel={() => setAsking(null)}
    >
      This may improve privacy at the cost of performance.
    </ConfirmDialog>
    <ConfirmDialog
      open={asking === "logs"}
      title="Clear logs?"
      danger
      confirmLabel="Clear logs"
      onConfirm={() => void handleClearLogsNow()}
      onCancel={() => setAsking(null)}
    >
      Every line in the log is removed. This cannot be undone.
    </ConfirmDialog>
    </>
  );
}
