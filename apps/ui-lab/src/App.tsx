import { useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components";
import {
  InKeyMainScreen,
  ResultsScreen,
  SettingsExportScreen,
  ToolSelectionScreen,
} from "./screens";
import { ScaleControls } from "./tokens/ScaleControls";
import { initScale, type ScaleFactor } from "./tokens/scale";
import "./tokens/scale-controls.css";
import "./App.css";

function AppShell() {
  const [scale, setScale] = useState<ScaleFactor>(() => initScale());

  useEffect(() => {
    document.title = "CuePoint UI Lab";
  }, []);

  return (
    <ToastProvider>
      <ScaleControls scale={scale} onChange={setScale} />
      <nav className="app-lab-nav" aria-label="Lab routes">
        <Link to="/">Tools</Link>
        <Link to="/match">inKey</Link>
        <Link to="/results">Results</Link>
        <Link to="/settings">Settings</Link>
      </nav>
      <Routes>
        <Route path="/" element={<ToolSelectionScreen />} />
        <Route path="/match" element={<InKeyMainScreen />} />
        <Route path="/results" element={<ResultsScreen />} />
        <Route path="/settings" element={<SettingsExportScreen />} />
      </Routes>
    </ToastProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
