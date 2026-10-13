import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./index";
import { Button } from "./Button";
import { MoreAbout } from "./MoreAbout";
import { DESKTOP_ENGINE_VERSION } from "./AboutDialog";
import { userMessage } from "../api/userMessage";
import { lastReportId, reportingSetUp, sendProblemReport, setReportingChoice } from "../reporting/reporting";
import { shortReportId } from "../reporting/ErrorScreen";
import "./GetHelpDialog.css";

interface GetHelpDialogProps {
  open: boolean;
  onClose: () => void;
  /** Close this dialog and open Diagnostics (the app does both). */
  onOpenDiagnostics?: () => void;
  /** Close this dialog and open the log viewer. */
  onOpenLogViewer?: () => void;
}

type Choice = "unknown" | "on" | "off" | "unavailable";
type Phase = "editing" | "sending" | "sent" | "failed";
type HelpFile = { kind: "idle" } | { kind: "saved" } | { kind: "error"; message: string };

/**
 * Help → Get help (DEC-265, amending DEC-204 and DEC-152).
 *
 * One place for "something is not working": a note sent as Sentry user feedback (the old
 * Report a problem), and a help file to attach to an email or an issue (the old support
 * bundle). The note goes exactly as written, and the dialog says so: it is the one thing a
 * report carries that is not scrubbed. The choice is read again when the dialog opens and
 * the note is not sent while reporting is off. The help file works either way.
 */
export function GetHelpDialog({ open, onClose, onOpenDiagnostics, onOpenLogViewer }: GetHelpDialogProps) {
  const [note, setNote] = useState("");
  const [version, setVersion] = useState<string>(DESKTOP_ENGINE_VERSION);
  const [choice, setChoice] = useState<Choice>("unknown");
  const [phase, setPhase] = useState<Phase>("editing");
  // The last report is read when the dialog opens: it is what the user just saw go wrong.
  const [lastId, setLastId] = useState<string | null>(null);
  const [helpFile, setHelpFile] = useState<HelpFile>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  const mounted = useRef(true);
  // Counts the times the dialog has opened; an answer from an earlier one is dropped.
  const session = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    session.current += 1;
    if (!open) return;
    setNote("");
    setPhase("editing");
    setChoice("unknown");
    setHelpFile({ kind: "idle" });
    setFolderError(null);
    setLastId(lastReportId());
    let live = true;
    const bridge = window.cuepoint;
    if (bridge?.errorReporting) {
      bridge.errorReporting
        .get()
        .then((answer) => {
          if (!live) return;
          setReportingChoice(answer.enabled);
          if (!reportingSetUp()) setChoice("unavailable");
          else setChoice(answer.enabled ? "on" : "off");
        })
        .catch(() => {
          if (live) setChoice("unavailable");
        });
    } else {
      setChoice("unavailable");
    }
    if (typeof bridge?.getEngineStatus === "function") {
      bridge
        .getEngineStatus()
        .then((status) => {
          if (live && status.version) setVersion(status.version);
        })
        .catch(() => {
          // The About dialog's fallback stays.
        });
    }
    return () => {
      live = false;
    };
  }, [open]);

  const canSend = choice === "on" && note.trim() !== "" && phase !== "sending" && phase !== "sent";

  // Sending waits for Sentry's answer, so "sent" is only said when it was.
  const send = () => {
    if (!canSend) return;
    setPhase("sending");
    const mine = session.current;
    const current = () => mounted.current && session.current === mine;
    sendProblemReport(note, version).then(
      (id) => {
        if (current()) setPhase(id ? "sent" : "failed");
      },
      () => {
        if (current()) setPhase("failed");
      },
    );
  };

  const bridge = typeof window === "undefined" ? undefined : window.cuepoint;
  const canSaveFile = typeof bridge?.exportSupportBundle === "function";
  const canOpenFolder = typeof bridge?.getLogsDir === "function" && typeof bridge?.showItemInFolder === "function";

  const saveHelpFile = useCallback(async () => {
    const api = window.cuepoint;
    if (!api?.exportSupportBundle) return;
    const mine = session.current;
    const current = () => mounted.current && session.current === mine;
    setSaving(true);
    setHelpFile({ kind: "idle" });
    try {
      const result = await api.exportSupportBundle({
        include_logs: true,
        include_config: true,
        sanitize: true,
      });
      if (!current()) return;
      if (result.canceled || !result.bundle_path) return;
      // The file is saved; failing to reveal it must not say otherwise.
      setHelpFile({ kind: "saved" });
      await Promise.resolve(api.showItemInFolder?.(result.bundle_path)).catch(() => {});
    } catch (error) {
      if (current()) {
        setHelpFile({ kind: "error", message: userMessage(error, "The help file could not be saved.") });
      }
    } finally {
      if (current()) setSaving(false);
    }
  }, []);

  const openLogFolder = useCallback(async () => {
    const api = window.cuepoint;
    if (!api?.getLogsDir || !api.showItemInFolder) return;
    const mine = session.current;
    setFolderError(null);
    try {
      const result = await api.getLogsDir();
      await api.showItemInFolder(result.logs_dir);
    } catch (error) {
      if (mounted.current && session.current === mine) setFolderError(userMessage(error, "The log folder could not be opened."));
    }
  }, []);

  const canReport = choice === "on" || choice === "unknown";

  return (
    <Modal
      open={open}
      title="Get help"
      onClose={onClose}
      secondaryAction={{ label: phase === "sent" || !canReport ? "Close" : "Cancel", onClick: onClose }}
      primaryAction={
        phase === "sent" || !canReport
          ? undefined
          : { label: "Send note", onClick: send, loading: phase === "sending", disabled: !canSend }
      }
    >
      <div className="get-help-dialog">
        <p className="get-help-dialog__lead">Something not working? Tell us what you were doing.</p>
        {choice === "off" ? (
          <p className="get-help-dialog__off" role="status">
            Sending is off in Settings: save a help file and attach it to your email or GitHub issue.
          </p>
        ) : null}
        {choice === "unavailable" ? (
          <p className="get-help-dialog__off" role="status">
            Sending is off in this version: save a help file and attach it to your email or GitHub issue.
          </p>
        ) : null}
        {canReport ? (
          <>
            <label className="get-help-dialog__field">
              <span>What were you doing?</span>
              <textarea
                value={note}
                rows={5}
                disabled={choice !== "on" || phase === "sent"}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <p className="get-help-dialog__note">
              Your note is sent exactly as you write it. Do not put anything in it you would not want
              us to read.
            </p>
          </>
        ) : null}
        <ul className="get-help-dialog__facts">
          <li>
            Version: <span data-testid="get-help-version">{version}</span>
          </li>
          <li>
            Last report:{" "}
            <span data-testid="get-help-last-report">{lastId ? shortReportId(lastId) : "none"}</span>
          </li>
        </ul>
        {phase === "sent" ? (
          <p className="get-help-dialog__done" role="status">
            Thank you. Your note was sent.
          </p>
        ) : null}
        {phase === "failed" ? (
          <p className="get-help-dialog__error" role="alert">
            Your note could not be sent. Check your connection and try again.
          </p>
        ) : null}

        {canSaveFile || canOpenFolder ? (
          <section className="get-help-dialog__file" aria-label="Help file">
            {canSaveFile ? (
              <>
                <div className="get-help-dialog__row">
                  <Button variant="secondary" loading={saving} onClick={() => void saveHelpFile()}>
                    Save a help file…
                  </Button>
                  {canOpenFolder ? (
                    <button type="button" className="cp-link get-help-dialog__link" onClick={() => void openLogFolder()}>
                      Open log folder
                    </button>
                  ) : null}
                </div>
                <p className="get-help-dialog__note">
                  Saves your settings and CuePoint&apos;s log as one file you can attach to an email. Your
                  sign-in and your user folder name are left out.
                </p>
              </>
            ) : (
              <button type="button" className="cp-link get-help-dialog__link" onClick={() => void openLogFolder()}>
                Open log folder
              </button>
            )}
            {helpFile.kind === "saved" ? (
              <p className="get-help-dialog__done" role="status">
                Help file saved.
              </p>
            ) : null}
            {helpFile.kind === "error" ? (
              <p className="get-help-dialog__error" role="alert">
                {helpFile.message}
              </p>
            ) : null}
            {folderError ? (
              <p className="get-help-dialog__error" role="alert">
                {folderError}
              </p>
            ) : null}
          </section>
        ) : null}

        {onOpenDiagnostics || onOpenLogViewer ? (
          <MoreAbout label="Details for support">
            <div className="get-help-dialog__row">
              {onOpenDiagnostics ? (
                <Button variant="secondary" size="sm" onClick={onOpenDiagnostics}>
                  Diagnostics…
                </Button>
              ) : null}
              {onOpenLogViewer ? (
                <Button variant="secondary" size="sm" onClick={onOpenLogViewer}>
                  Log viewer…
                </Button>
              ) : null}
            </div>
          </MoreAbout>
        ) : null}
      </div>
    </Modal>
  );
}
