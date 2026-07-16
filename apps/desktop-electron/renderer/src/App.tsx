import { useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
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
      <AppMenuBar {...menuActions} />
      <EngineStatusBanner />
      <nav className="app-lab-nav" aria-label="Main navigation">
        <Link to="/">Tools</Link>
        <Link to="/match">inKey</Link>
        <Link to="/incrate">inCrate</Link>
        <Link to="/results">Results</Link>
        <Link to="/settings">Settings</Link>
      </nav>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<ToolSelectionScreen />} />
          <Route
            path="/match"
            element={<InKeyMainScreen onOpenPlaylistExportInstructions={() => setPlaylistExportInstructionsOpen(true)} />}
          />
          <Route path="/incrate" element={<InCrateMainScreen />} />
          <Route path="/results" element={<ResultsScreen />} />
          <Route path="/settings" element={<SettingsExportScreen />} />
        </Routes>
      </main>
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
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ScaleProvider>
          <ToastProvider>
            <MatchResultsProvider>
              <AppShell />
            </MatchResultsProvider>
          </ToastProvider>
        </ScaleProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
