import { useState } from "react";
import { Button } from "../components/Button";
import { GetHelpDialog } from "../components/GetHelpDialog";
import { shortReportId } from "./shortReportId";
import "../components/Modal.css";
import "./ErrorScreen.css";

interface ErrorScreenProps {
  /** `app` fills the window; `page` fills the content area and leaves the shell alone. */
  scope: "app" | "page";
  /** The report's id, when one was made. Only its first 8 characters are shown. */
  reportId: string | null;
  onReload: () => void;
}

/**
 * What the user sees instead of a blank window when a screen throws (REPORT-06,
 * DEC-126). It is drawn in a dialog's own chrome (M281): the title, the words, and the two things
 * to do, Reload and Get help, which opens the help dialog right here since the app around it may be
 * what failed. The short id is shown when a report was made, in the code face (M280).
 *
 * The dialog is drawn in place, not over a backdrop, so a page that failed leaves the shell usable.
 */
export function ErrorScreen({ scope, reportId, onReload }: ErrorScreenProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <div className={`cp-error-screen cp-error-screen--${scope}`} role="alert" data-testid="error-screen">
      <div className="cp-modal cp-modal--small cp-error-screen__dialog">
        <header className="cp-modal__header">
          <h2 className="cp-modal__title">Something went wrong</h2>
        </header>
        <div className="cp-modal__body">
          <p className="cp-error-screen__text">
            {scope === "app"
              ? "CuePoint hit a problem it could not recover from."
              : "This page hit a problem. The rest of CuePoint still works."}{" "}
            Reload to start again; your library and files are untouched.
          </p>
          {reportId !== null && (
            <p className="cp-error-screen__id">
              Report <code data-testid="error-screen-report-id">{shortReportId(reportId)}</code>
            </p>
          )}
        </div>
        <footer className="cp-modal__footer">
          <Button variant="secondary" onClick={() => setHelpOpen(true)}>
            Get help
          </Button>
          <Button variant="primary" onClick={onReload}>
            Reload
          </Button>
        </footer>
      </div>
      <GetHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
