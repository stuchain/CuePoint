import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import "./ErrorScreen.css";

interface ErrorScreenProps {
  /** `app` fills the window; `page` fills the content area and leaves the shell alone. */
  scope: "app" | "page";
  /** The report's id, when one was made. Only its first 8 characters are shown. */
  reportId: string | null;
  onReload: () => void;
}

/** The short form of a report id, for the screen and for a person to read out. */
export function shortReportId(id: string): string {
  return id.slice(0, 8);
}

/**
 * What the user sees instead of a blank window when a screen throws (REPORT-06,
 * DEC-126). It says so, offers Reload, and shows the short id when a report was made.
 */
export function ErrorScreen({ scope, reportId, onReload }: ErrorScreenProps) {
  return (
    <div className={`cp-error-screen cp-error-screen--${scope}`} role="alert" data-testid="error-screen">
      <Panel title="Something went wrong" className="cp-error-screen__panel">
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
        <div className="cp-error-screen__actions">
          <Button onClick={onReload}>Reload</Button>
        </div>
      </Panel>
    </div>
  );
}
