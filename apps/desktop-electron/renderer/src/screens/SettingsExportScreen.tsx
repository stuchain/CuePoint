import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { Button, Panel, TextField } from "../components";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { useBeatportToken } from "../hooks/useBeatportToken";
import { AudioSettingsPanel } from "./AudioSettingsPanel";
import { RekordboxExportSettingsPanel } from "./RekordboxExportSettingsPanel";
import { ThemeSettingsPanel } from "./ThemeSettingsPanel";
import { WaveformSettingsPanel } from "./WaveformSettingsPanel";
import { settingsFocus } from "./settingsLink";
import "./screens.css";

/** The Beatport token field's id: what Discover's Settings link focuses. */
export const BEATPORT_TOKEN_FIELD_ID = "settings-beatport-token";

/**
 * Settings. Exporting matches moved to Clean's "Export review list" when
 * Results retired (DEC-071), so this page holds settings only. The Rekordbox
 * export's section shows where exports go and offers no way to start one
 * (DEC-087).
 */
export function SettingsExportScreen() {
  const engineAvailable = hasEngineBridge();
  const {
    status,
    draft,
    setDraft,
    loading,
    loaded,
    saving,
    testing,
    testMessage,
    save,
    test,
  } = useBeatportToken();

  // Discover's "no token" and "token rejected" states link here, to the token
  // field (DISCOVER-10). Scrolled to and focused once per navigation — once
  // its status has been read: the field is disabled while it loads, and a
  // field disabled after it was focused loses the focus without a word.
  const location = useLocation();
  const focusToken = settingsFocus(location)?.token ?? null;
  const focused = useRef<string | null>(null);
  const fieldReady = engineAvailable && loaded && !loading;
  useEffect(() => {
    if (!focusToken || !fieldReady || focused.current === focusToken) return;
    focused.current = focusToken;
    const field = document.getElementById(BEATPORT_TOKEN_FIELD_ID);
    field?.scrollIntoView?.({ block: "center" });
    field?.focus();
  }, [fieldReady, focusToken]);

  const tokenHint = engineAvailable
    ? status.configured
      ? `Saved token ${status.masked ?? ""}. Enter a new value to replace it.`
      : "Stored in ~/.cuepoint/config.yaml via the Python engine."
    : "Open in Electron to store the token in the engine config.";

  return (
    <div className="screen screen--stack screen--scroll">
      <ThemeSettingsPanel />

      <AudioSettingsPanel />

      <WaveformSettingsPanel />

      <RekordboxExportSettingsPanel />

      <Panel title="Settings">
        <div className="settings-form">
          <TextField
            label="Beatport token"
            id={BEATPORT_TOKEN_FIELD_ID}
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
