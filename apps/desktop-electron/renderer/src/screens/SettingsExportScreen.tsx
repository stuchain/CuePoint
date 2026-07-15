import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Panel, TextField } from "../components";
import { ExportResultsButton } from "../components/ExportResultsModal";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { ThemeSettingsPanel } from "./ThemeSettingsPanel";
import { useMatchResults } from "../context/MatchResultsContext";
import { sampleResults } from "../mocks/fixtures";
import "./screens.css";

export function SettingsExportScreen() {
  const { results: engineResults, source } = useMatchResults();
  const exportRows = source === "engine" && engineResults.length > 0 ? engineResults : sampleResults;
  const engineAvailable = hasEngineBridge();

  useEffect(() => {
    document.body.classList.add("app-page-scroll");
    window.scrollTo(0, 0);
    return () => document.body.classList.remove("app-page-scroll");
  }, []);

  return (
    <div className="screen screen--stack screen--scroll">
      <header className="screen-toolbar">
        <Link to="/match" className="screen-toolbar__brand">
          ← Back to inKey
        </Link>
      </header>

      <ThemeSettingsPanel />

      <Panel title="Settings">
        <div className="settings-form">
          <TextField label="Beatport token" type="password" placeholder="••••••••" hint="Stored locally in engine (mock)." />
        </div>
      </Panel>

      <Panel title="Export">
        <p className="screen__muted">
          Export matched metadata to CSV, JSON, or Excel
          {engineAvailable ? " via the Python engine." : " (mock in browser)."}
        </p>
        <ExportResultsButton rows={exportRows} playlistName="cuepoint-export" variant="primary" />
      </Panel>
    </div>
  );
}
