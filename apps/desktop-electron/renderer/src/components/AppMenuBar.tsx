import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./AppMenuBar.css";

export interface AppMenuActions {
  onOpenSupport: () => void;
  onOpenShortcuts: () => void;
  onOpenPrivacy: () => void;
  onOpenAbout: () => void;
  onOpenDiagnostics: () => void;
  onOpenLogViewer: () => void;
  onShowOnboarding: () => void;
  onOpenRekordboxInstructions: () => void;
  onOpenPlaylistExportInstructions: () => void;
}

export function AppMenuBar({
  onOpenSupport,
  onOpenShortcuts,
  onOpenPrivacy,
  onOpenAbout,
  onOpenDiagnostics,
  onOpenLogViewer,
  onShowOnboarding,
  onOpenRekordboxInstructions,
  onOpenPlaylistExportInstructions,
}: AppMenuActions) {
  const [helpOpen, setHelpOpen] = useState(false);

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
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => run(onOpenPlaylistExportInstructions)}
                >
                  Playlist (M3U) export instructions…
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => run(onOpenSupport)}>
                  Export support bundle…
                </button>
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
