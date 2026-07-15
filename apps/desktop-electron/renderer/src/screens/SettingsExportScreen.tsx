import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button, Panel, TextField } from "../components";
import { ExportResultsButton } from "../components/ExportResultsModal";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { useBeatportToken } from "../hooks/useBeatportToken";
import { ThemeSettingsPanel } from "./ThemeSettingsPanel";
import { useMatchResults } from "../context/MatchResultsContext";
import { sampleResults } from "../mocks/fixtures";
import "./screens.css";

export function SettingsExportScreen() {
  const { results: engineResults, source } = useMatchResults();
  const exportRows = source === "engine" && engineResults.length > 0 ? engineResults : sampleResults;
  const engineAvailable = hasEngineBridge();
  const {
    status,
    draft,
    setDraft,
    loading,
    saving,
    testing,
    testMessage,
    save,
    test,
  } = useBeatportToken();

  useEffect(() => {
    document.body.classList.add("app-page-scroll");
    window.scrollTo(0, 0);
    return () => document.body.classList.remove("app-page-scroll");
  }, []);

  const tokenHint = engineAvailable
    ? status.configured
      ? `Saved token ${status.masked ?? ""}. Enter a new value to replace it.`
      : "Stored in ~/.cuepoint/config.yaml via the Python engine."
    : "Open in Electron to store the token in the engine config.";

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
          <TextField
            label="Beatport token"
            type="password"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={status.configured ? "Enter new token to replace saved value" : "Paste Bearer token"}
            hint={loading ? "Loading token status…" : tokenHint}
            disabled={!engineAvailable || loading}
          />
          <div className="match-actions">
            <Button
              variant="primary"
              loading={saving}
              disabled={!engineAvailable || !draft.trim()}
              onClick={() => void save()}
            >
              Save token
            </Button>
            <Button
              variant="secondary"
              loading={testing}
              disabled={!engineAvailable || (!draft.trim() && !status.configured)}
              onClick={() => void test()}
            >
              Test connection
            </Button>
          </div>
          {testMessage ? <p className="screen__muted">{testMessage}</p> : null}
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
