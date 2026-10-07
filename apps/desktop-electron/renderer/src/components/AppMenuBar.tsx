import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { reportingActive, reportingSetUp, setReportingChoice } from "../reporting/reporting";
import "./AppMenuBar.css";

interface AppMenuActions {
  onOpenSupport: () => void;
  onOpenShortcuts: () => void;
  onOpenPrivacy: () => void;
  onOpenAbout: () => void;
  /** Help → Report a problem (DEC-152). */
  onReportProblem: () => void;
  onOpenDiagnostics: () => void;
  onOpenLogViewer: () => void;
  onShowOnboarding: () => void;
  onOpenRekordboxInstructions: () => void;
}

export function AppMenuBar({
  onOpenSupport,
  onOpenShortcuts,
  onOpenPrivacy,
  onOpenAbout,
  onReportProblem,
  onOpenDiagnostics,
  onOpenLogViewer,
  onShowOnboarding,
  onOpenRekordboxInstructions,
}: AppMenuActions) {
  const [helpOpen, setHelpOpen] = useState(false);

  // Whether a problem report can be sent: reporting set up, and the choice on. Read again each
  // time the menu opens, because the switch in Settings can change it (DEC-152).
  const [reportsOn, setReportsOn] = useState(reportingActive);
  const [reportsSetUp, setReportsSetUp] = useState(reportingSetUp);
  const reportProblemAvailable = reportsOn;

  useEffect(() => {
    if (!helpOpen) return;
    const bridge = window.cuepoint?.errorReporting;
    if (!bridge) return;
    let live = true;
    bridge
      .get()
      .then((answer) => {
        if (!live) return;
        setReportingChoice(answer.enabled);
        setReportsSetUp(reportingSetUp());
        setReportsOn(reportingSetUp() && answer.enabled);
      })
      .catch(() => {
        // Unreadable: keep what was known.
      });
    return () => {
      live = false;
    };
  }, [helpOpen]);

  const closeMenus = useCallback(() => setHelpOpen(false), []);

  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMenus, helpOpen]);

  const run = (action: () => void) => {
    setHelpOpen(false);
    action();
  };

  return (
    <header className="app-menu-bar" role="banner">
      <span className="app-menu-bar__brand">CuePoint</span>
      <nav className="app-menu-bar__menus" aria-label="Application menu">
        <div className="app-menu-bar__menu">
          <button
            type="button"
            className="app-menu-bar__trigger"
            aria-expanded={helpOpen}
            aria-haspopup="menu"
            onClick={() => setHelpOpen((open) => !open)}
          >
            Help
          </button>
          {helpOpen ? (
            <ul className="app-menu-bar__dropdown" role="menu">
              <li role="none">
                <button type="button" role="menuitem" onClick={() => run(onShowOnboarding)}>
                  Getting started…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => run(onOpenShortcuts)}>
                  Keyboard shortcuts…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => run(onOpenPrivacy)}>
                  Privacy…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => run(onOpenDiagnostics)}>
                  Diagnostics…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => run(onOpenLogViewer)}>
                  Log Viewer…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => run(onOpenRekordboxInstructions)}>
                  Rekordbox XML export…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => run(onOpenSupport)}>
                  Export support bundle…
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!reportProblemAvailable}
                  aria-describedby={reportProblemAvailable ? undefined : "app-menu-report-off"}
                  onClick={() => run(onReportProblem)}
                >
                  Report a problem…
                </button>
                {reportProblemAvailable ? null : (
                  <span id="app-menu-report-off" className="app-menu-bar__note">
                    {reportsSetUp ? "Error reports are off in Settings" : "Error reports are not set up in this build"}
                  </span>
                )}
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => run(onOpenAbout)}>
                  About CuePoint…
                </button>
              </li>
              <li role="separator" className="app-menu-bar__sep" />
              <li role="none">
                <Link to="/settings" role="menuitem" onClick={closeMenus}>
                  Settings
                </Link>
              </li>
            </ul>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
