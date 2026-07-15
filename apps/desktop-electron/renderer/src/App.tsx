import { useEffect } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { ToastProvider } from "./components";
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
import "./App.css";

function AppShell() {
  const location = useLocation();

  useEffect(() => {
    document.title = "CuePoint UI Lab";
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector(".app-main")?.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <>
      <EngineStatusBanner />
      <nav className="app-lab-nav" aria-label="Lab routes">
        <Link to="/">Tools</Link>
        <Link to="/match">inKey</Link>
        <Link to="/incrate">inCrate</Link>
        <Link to="/results">Results</Link>
        <Link to="/settings">Settings</Link>
      </nav>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<ToolSelectionScreen />} />
          <Route path="/match" element={<InKeyMainScreen />} />
          <Route path="/incrate" element={<InCrateMainScreen />} />
          <Route path="/results" element={<ResultsScreen />} />
          <Route path="/settings" element={<SettingsExportScreen />} />
        </Routes>
      </main>
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
