import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./index";
import { Button } from "./Button";
import { MoreAbout } from "./MoreAbout";
import { Notice } from "./Notice";
import { DESKTOP_ENGINE_VERSION, versionWords } from "./AboutDialog";
import { Textarea } from "./Textarea";
import type { AppBuildInfo } from "../api/cuepointBridge.types";
import { OPEN_LOG_FOLDER, couldNot } from "../format/words";
import { userMessage } from "../api/userMessage";
import { lastReportId, reportingSetUp, sendProblemReport, setReportingChoice } from "../reporting/reporting";
import { shortReportId } from "../reporting/shortReportId";
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
  const [build, setBuild] = useState<AppBuildInfo | null>(null);
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
    if (typeof bridge?.buildInfo === "function") {
      bridge
        .buildInfo()
        .then((info) => {
          if (live) setBuild(info);
        })
        .catch(() => {
          // The version alone still shows.
        });
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
        setHelpFile({ kind: "error", message: userMessage(error, couldNot("save the help file")) });
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
      if (mounted.current && session.current === mine) setFolderError(userMessage(error, couldNot("open the logs folder")));
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
        <p className="cp-modal__lead">
          {choice === "off"
            ? "Sending is off in Settings. Save a help file and attach it to an email or a GitHub issue."
            : choice === "unavailable"
              ? "Sending is off in this version. Save a help file and attach it to an email or a GitHub issue."
              : "Tell us what went wrong, or save a help file and attach it to an email or a GitHub issue."}
        </p>
        {canReport ? (
          <>
            <Textarea
              label="What were you doing?"
              value={note}
              rows={5}
              disabled={choice !== "on" || phase === "sent"}
              onChange={(event) => setNote(event.target.value)}
            />
            <p className="get-help-dialog__note">
              Your note is sent exactly as you write it. Do not put anything in it you would not want
              us to read.
            </p>
          </>
        ) : null}
        <dl className="cp-facts cp-facts--dialog">
          <dt>Version</dt>
          <dd data-testid="get-help-version">{versionWords(version, build)}</dd>
          <dt>Last report</dt>
          <dd className="get-help-dialog__id" data-testid="get-help-last-report">{lastId ? shortReportId(lastId) : "—"}</dd>
        </dl>
        {phase === "sent" ? (
          <p className="get-help-dialog__done" role="status">
            Thank you. Your note was sent.
          </p>
        ) : null}
        {phase === "failed" ? (
          <Notice kind="danger" className="get-help-dialog__error">
            Your note could not be sent. Check your connection and try again.
          </Notice>
        ) : null}

        {canSaveFile || canOpenFolder ? (
          <section className="get-help-dialog__file" aria-label="Help file">
            <div className="cp-button-row">
              {canSaveFile ? (
                <Button variant="quiet" loading={saving} onClick={() => void saveHelpFile()}>
                  Save a help file…
                </Button>
              ) : null}
              {canOpenFolder ? (
                <Button variant="quiet" onClick={() => void openLogFolder()}>
                  {OPEN_LOG_FOLDER}
                </Button>
              ) : null}
            </div>
            {canSaveFile ? (
              <p className="get-help-dialog__note">
                Saves your settings and CuePoint&apos;s log as one file you can attach to an email. Your
                sign-in and your user folder name are left out.
              </p>
            ) : null}
            {helpFile.kind === "saved" ? (
              <p className="get-help-dialog__done" role="status">
                Help file saved
              </p>
            ) : null}
            {helpFile.kind === "error" ? (
              <Notice kind="danger" className="get-help-dialog__error">
                {helpFile.message}
              </Notice>
            ) : null}
            {folderError ? (
              <Notice kind="danger" className="get-help-dialog__error">
                {folderError}
              </Notice>
            ) : null}
          </section>
        ) : null}

        {onOpenDiagnostics || onOpenLogViewer ? (
          <MoreAbout label="Details for support">
            <div className="cp-button-row">
              {onOpenDiagnostics ? (
                <Button variant="quiet" size="sm" onClick={onOpenDiagnostics}>
                  Diagnostics
                </Button>
              ) : null}
              {onOpenLogViewer ? (
                <Button variant="quiet" size="sm" onClick={onOpenLogViewer}>
                  Log viewer
                </Button>
              ) : null}
            </div>
          </MoreAbout>
        ) : null}
      </div>
    </Modal>
  );
}
