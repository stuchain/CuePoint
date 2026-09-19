import { Button, Panel, TextField } from "../components";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { useBeatportToken } from "../hooks/useBeatportToken";
import { AudioSettingsPanel } from "./AudioSettingsPanel";
import { ThemeSettingsPanel } from "./ThemeSettingsPanel";
import "./screens.css";

/**
 * Settings. Exporting matches moved to Clean's "Export review list" when
 * Results retired (DEC-071), so this page holds settings only.
 */
export function SettingsExportScreen() {
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

  const tokenHint = engineAvailable
    ? status.configured
      ? `Saved token ${status.masked ?? ""}. Enter a new value to replace it.`
      : "Stored in ~/.cuepoint/config.yaml via the Python engine."
    : "Open in Electron to store the token in the engine config.";

  return (
    <div className="screen screen--stack screen--scroll">
      <ThemeSettingsPanel />

      <AudioSettingsPanel />

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
    </div>
  );
}
