import { useEffect, useRef, useState } from "react";
import { Modal } from "./index";
import { DESKTOP_ENGINE_VERSION } from "./AboutDialog";
import { lastReportId, reportingSetUp, sendProblemReport, setReportingChoice } from "../reporting/reporting";
import { shortReportId } from "../reporting/ErrorScreen";
import "./ReportProblemDialog.css";

interface ReportProblemDialogProps {
  open: boolean;
  onClose: () => void;
}

type Choice = "unknown" | "on" | "off" | "unavailable";
type Phase = "editing" | "sending" | "sent" | "failed";

/**
 * Help → Report a problem (DEC-152, REPORT-06).
 *
 * A note, the app's version and the last report's id, sent as Sentry user feedback.
 * The note goes exactly as written, and the dialog says so: it is the one thing a
 * report carries that is not scrubbed. The choice is read again when the dialog opens
 * and the note is not sent while reporting is off.
 */
export function ReportProblemDialog({ open, onClose }: ReportProblemDialogProps) {
  const [note, setNote] = useState("");
  const [version, setVersion] = useState<string>(DESKTOP_ENGINE_VERSION);
  const [choice, setChoice] = useState<Choice>("unknown");
  const [phase, setPhase] = useState<Phase>("editing");
  // The last report is read when the dialog opens: it is what the user just saw go wrong.
  const [lastId, setLastId] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setPhase("editing");
    setChoice("unknown");
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
    sendProblemReport(note, version).then(
      (id) => {
        if (mounted.current) setPhase(id ? "sent" : "failed");
      },
      () => {
        if (mounted.current) setPhase("failed");
      },
    );
  };

  return (
    <Modal
      open={open}
      title="Report a problem"
      onClose={onClose}
      secondaryAction={{ label: phase === "sent" ? "Close" : "Cancel", onClick: onClose }}
      primaryAction={
        phase === "sent"
          ? undefined
          : { label: "Send", onClick: send, loading: phase === "sending", disabled: !canSend }
      }
    >
      <div className="report-problem-dialog">
        {choice === "off" ? (
          <p className="report-problem-dialog__off" role="status">
            Error reports are off in Settings. Turn them on there to send a note.
          </p>
        ) : null}
        {choice === "unavailable" ? (
          <p className="report-problem-dialog__off" role="status">
            Error reports are not available in this build, so a note cannot be sent.
          </p>
        ) : null}
        <label className="report-problem-dialog__field">
          <span>What were you doing?</span>
          <textarea
            value={note}
            rows={5}
            disabled={choice !== "on" || phase === "sent"}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <p className="report-problem-dialog__note">
          Your note is sent exactly as you write it. Do not put anything in it you would not want
          us to read.
        </p>
        <ul className="report-problem-dialog__facts">
          <li>
            Version: <span data-testid="report-problem-version">{version}</span>
          </li>
          <li>
            Last report:{" "}
            <span data-testid="report-problem-last-report">
              {lastId ? shortReportId(lastId) : "none"}
            </span>
          </li>
        </ul>
        {phase === "sent" ? (
          <p className="report-problem-dialog__done" role="status">
            Thank you. Your note was sent.
          </p>
        ) : null}
        {phase === "failed" ? (
          <p className="report-problem-dialog__error" role="alert">
            Your note could not be sent. Check your connection and try again.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
