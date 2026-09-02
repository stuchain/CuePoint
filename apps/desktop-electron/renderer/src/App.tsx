import { useEffect, useState } from "react";
import { HashRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import {
  AboutDialog,
  AppMenuBar,
  DiagnosticsDialog,
  LogViewerDialog,
  OnboardingDialog,
  PrivacyDialog,
  RekordboxInstructionsDialog,
  PlaylistExportInstructionsDialog,
  ShortcutsDialog,
  SupportBundleDialog,
  ToastProvider,
} from "./components";
import { EngineStatusBanner } from "./components/EngineStatusBanner";
import {
  applyLaunchDestination,
  AppShellLayout,
  enabledDestinations,
  HOME_DESTINATION_ID,
  useRememberDestination,
} from "./components/shell";
import { MatchResultsProvider } from "./context/MatchResultsContext";
import {
  InCrateMainScreen,
  InKeyMainScreen,
  ResultsScreen,
  SettingsExportScreen,
  ToolSelectionScreen,
} from "./screens";
import { ScaleProvider } from "./tokens/ScaleContext";
import { ThemeProvider } from "./tokens/ThemeContext";
import { shouldShowOnboarding } from "./components/OnboardingDialog";
import "./App.css";

function AppShell() {
  const location = useLocation();
  const [supportOpen, setSupportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(() => shouldShowOnboarding());
  const [rekordboxOpen, setRekordboxOpen] = useState(false);
  const [logViewerOpen, setLogViewerOpen] = useState(false);
  const [playlistExportInstructionsOpen, setPlaylistExportInstructionsOpen] = useState(false);

  useEffect(() => {
    document.title = "CuePoint";
  }, []);

  useEffect(() => {
    const clearCacheOnExit = localStorage.getItem(
      "cuepoint-privacy-clear-cache-on-exit",
    ) === "1";
    const clearLogsOnExit = localStorage.getItem(
      "cuepoint-privacy-clear-logs-on-exit",
    ) === "1";
    void window.cuepoint?.setPrivacyExitPrefs?.({ clearCacheOnExit, clearLogsOnExit });
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector(".app-main")?.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F1") {
        event.preventDefault();
        setShortcutsOpen(true);
      }
      if (event.ctrlKey && (event.key === "?" || (event.shiftKey && event.key === "/"))) {
        event.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useRememberDestination();

  /**
   * Maps a destination id to the screen that renders it.
   *
   * This lives here rather than in the registry because two of these screens
   * need callbacks that open dialogs owned by this component; putting elements
   * in the registry would drag that state into what is meant to stay data.
   */
  const screenFor = (id: string) => {
    switch (id) {
      case "tools":
        return <ToolSelectionScreen />;
      case "match":
        return (
          <InKeyMainScreen
            onOpenPlaylistExportInstructions={() => setPlaylistExportInstructionsOpen(true)}
          />
        );
      case "incrate":
        return <InCrateMainScreen />;
      case "results":
        return <ResultsScreen />;
      case "settings":
        return <SettingsExportScreen />;
      default:
        return <ToolSelectionScreen />;
    }
  };

  const menuActions = {
    onOpenSupport: () => setSupportOpen(true),
    onOpenShortcuts: () => setShortcutsOpen(true),
    onOpenPrivacy: () => setPrivacyOpen(true),
    onOpenAbout: () => setAboutOpen(true),
    onOpenDiagnostics: () => setDiagnosticsOpen(true),
    onOpenLogViewer: () => setLogViewerOpen(true),
    onShowOnboarding: () => setOnboardingOpen(true),
    onOpenRekordboxInstructions: () => setRekordboxOpen(true),
    onOpenPlaylistExportInstructions: () => setPlaylistExportInstructionsOpen(true),
  };

  return (
    <>
      {/*
        The menu bar is a shell region now. The engine-status banner and the
        lab-era nav pill are both fixed-position overlays, so they stay outside
        the grid: the banner gets its permanent home in the status strip in
        SHELL-07, and the pill is deleted in SHELL-02.
      */}
      <AppShellLayout menuBar={<AppMenuBar {...menuActions} />}>
        <Routes>
          {enabledDestinations().map((destination) => (
            <Route
              key={destination.id}
              path={destination.path}
              element={screenFor(destination.id)}
            />
          ))}
          {/*
            A path that matches no destination renders home rather than nothing.
            This is the belt to the registry's braces: DEC-027's fallback keeps
            a stale stored destination from landing here, and this keeps any
            other unmatched path — a stray link, a future typo — from showing
            an empty content area, which is the failure this step exists to fix.
          */}
          <Route path="*" element={screenFor(HOME_DESTINATION_ID)} />
        </Routes>
      </AppShellLayout>
      <EngineStatusBanner />
      <nav className="app-lab-nav" aria-label="Main navigation">
        {enabledDestinations().map((destination) => (
          <Link key={destination.id} to={destination.path}>
            {destination.label}
          </Link>
        ))}
      </nav>
      <SupportBundleDialog open={supportOpen} onClose={() => setSupportOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <PrivacyDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <DiagnosticsDialog open={diagnosticsOpen} onClose={() => setDiagnosticsOpen(false)} />
      <OnboardingDialog open={onboardingOpen} onComplete={() => setOnboardingOpen(false)} />
      <RekordboxInstructionsDialog open={rekordboxOpen} onClose={() => setRekordboxOpen(false)} />
      <LogViewerDialog open={logViewerOpen} onClose={() => setLogViewerOpen(false)} />
      <PlaylistExportInstructionsDialog
        open={playlistExportInstructionsOpen}
        onClose={() => setPlaylistExportInstructionsOpen(false)}
      />
    </>
  );
}

export default function App() {
  // Before the router mounts, not after: see `applyLaunchDestination` for why
  // restoring from an effect leaves the URL and the screen disagreeing.
  useState(applyLaunchDestination);

  return (
    <HashRouter>
      <ThemeProvider>
        <ScaleProvider>
          <ToastProvider>
            <MatchResultsProvider>
              <AppShell />
            </MatchResultsProvider>
          </ToastProvider>
        </ScaleProvider>
      </ThemeProvider>
    </HashRouter>
  );
}
