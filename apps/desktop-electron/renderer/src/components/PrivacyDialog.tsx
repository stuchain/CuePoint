import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { settingsFocusState } from "../screens/settingsLink";
import { Button, Modal, useToast } from "./index";
import { ConfirmDialog } from "./ConfirmDialog";
import { LinkButton } from "./LinkButton";
import { reportUnexpected } from "../reporting/reporting";
import "./PrivacyDialog.css";
import { needsDesktopApp, userMessage } from "../api/userMessage";
import { couldNot } from "../format/words";

/** Short plain sentences under three headings (C171); each is one line to read. */
const STAYS_HERE = [
  "Your Rekordbox library, match history, settings and exports stay on your computer.",
  "Your Beatport sign-in is stored on your computer when you sign in.",
  "Logs and the cache are kept for debugging. You can clear the cache below, and the logs in the log viewer.",
  "CuePoint has no analytics and no usage tracking.",
];

const BEATPORT = [
  "CuePoint searches Beatport only when you ask it to.",
  "It sends nothing else about you or your library.",
];

const ERROR_REPORTS = [
  "When CuePoint hits an unexpected error, a released build sends a report to Sentry in the EU unless you turn it off.",
  "Reports are cleaned on your computer first. They leave out file, folder, track, artist, label and playlist names, the notes and tags you keep in CuePoint, and your Beatport sign-in.",
  "The Privacy Notice says what a report carries and how long it is kept.",
];

const UPDATES =
  "The installed app checks GitHub for updates at launch and every 4 hours, and downloads a new version from there. A check sends no id, no account and nothing from your library. You can also check in Settings → About & updates.";

function Sentences({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line) => (
        <p key={line} className="cp-prose cp-prose--body privacy-dialog__sentence">
          {line}
        </p>
      ))}
    </>
  );
}

interface PrivacyDialogProps {
  open: boolean;
  onClose: () => void;
  /** Close this dialog and open the log viewer, the one home of "Clear logs" (M243). */
  onOpenLogViewer?: () => void;
}

export function PrivacyDialog({ open, onClose, onOpenLogViewer }: PrivacyDialogProps) {
  // One flag per action (M242): clearing the cache never spins another button.
  const [clearingCache, setClearingCache] = useState(false);
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

  const [askingCache, setAskingCache] = useState(false);

  const handleClearCacheNow = async () => {
    if (!window.cuepoint?.clearCuepointCache) return;
    setAskingCache(false);
    setClearingCache(true);
    try {
      await window.cuepoint.clearCuepointCache();
      push("Cache cleared", "success");
    } catch (e) {
      reportUnexpected(e);
      push(userMessage(e, couldNot("clear the cache")), "warning");
    } finally {
      setClearingCache(false);
    }
  };

  // The one home of these choices is Settings → Privacy (SET-7).
  const handleChangeInSettings = () => {
    onClose();
    navigate("/settings", { state: settingsFocusState("privacy") });
  };

  // The switch's state, then where to change it (the notice's "Settings → Privacy → Send error reports").
  let reportingWords = "Error reports: …";
  if (!window.cuepoint?.errorReporting) reportingWords = needsDesktopApp("Error reporting");
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
        <p className="cp-modal__lead">{UPDATES}</p>

        <section className="privacy-dialog__group" aria-label="What stays on your computer">
          <h3 className="cp-text-subhead">What stays on your computer</h3>
          <Sentences lines={STAYS_HERE} />
        </section>

        <section className="privacy-dialog__group" aria-label="What goes to Beatport">
          <h3 className="cp-text-subhead">What goes to Beatport</h3>
          <Sentences lines={BEATPORT} />
        </section>

        <section className="privacy-dialog__group" aria-label="Error reports">
          <h3 className="cp-text-subhead">Error reports</h3>
          <Sentences lines={ERROR_REPORTS} />
          <p className="privacy-dialog__reporting">
            <span data-testid="privacy-error-reports">{reportingWords}</span>{" "}
            <LinkButton className="privacy-dialog__link" onClick={handleChangeInSettings}>
              Change these in Settings → Privacy
            </LinkButton>
          </p>
        </section>

        <div className="cp-button-row">
          <Button variant="secondary" loading={clearingCache} disabled={clearingCache} onClick={() => setAskingCache(true)}>
            Clear cache now…
          </Button>
          {onOpenLogViewer ? (
            <Button variant="quiet" onClick={onOpenLogViewer}>
              Open the log viewer…
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      open={askingCache}
      title="Clear cache?"
      confirmLabel="Clear cache"
      onConfirm={() => void handleClearCacheNow()}
      onCancel={() => setAskingCache(false)}
    >
      Removes the Beatport answers and artwork CuePoint keeps for speed. Your library, history and
      settings are not touched. The next search or page may be slower.
    </ConfirmDialog>
    </>
  );
}
