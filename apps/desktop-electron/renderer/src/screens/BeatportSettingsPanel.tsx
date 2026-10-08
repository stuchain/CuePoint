import { useEffect, useRef } from "react";

import { Button, Panel, TextField } from "../components";
import { useBeatportToken } from "../hooks/useBeatportToken";
import "./beatport-settings.css";

interface BeatportSettingsPanelProps {
  /** The token field's id: what Discover's Open Settings link focuses. */
  fieldId: string;
  /** One per navigation that asked for the field; it is focused once, when it can take focus. */
  focusToken?: string | null;
}

/**
 * Settings → Beatport (SET-5): the token Discover searches Beatport with, what
 * it is for, how to get one, and whether Beatport accepts it.
 */
export function BeatportSettingsPanel({ fieldId, focusToken = null }: BeatportSettingsPanelProps) {
  const {
    engineAvailable,
    status,
    draft,
    setDraft,
    loading,
    loaded,
    saving,
    testing,
    testMessage,
    testOk,
    testReason,
    save,
    test,
  } = useBeatportToken();

  // Discover's "no token" and "token rejected" states link here, to the token
  // field (DISCOVER-10). Scrolled to and focused once per navigation — once
  // its status has been read: the field is disabled while it loads, and a
  // field disabled after it was focused loses the focus without a word.
  const focused = useRef<string | null>(null);
  const fieldReady = engineAvailable && loaded && !loading;
  useEffect(() => {
    if (!focusToken || !fieldReady || focused.current === focusToken) return;
    focused.current = focusToken;
    const field = document.getElementById(fieldId);
    field?.scrollIntoView?.({ block: "center" });
    field?.focus();
  }, [fieldReady, fieldId, focusToken]);

  const tokenHint = engineAvailable
    ? status.configured
      ? `Saved token ${status.masked ?? ""}. Paste a new one to replace it.`
      : "Kept on this computer only."
    : "Open CuePoint as a desktop app to save a token.";

  return (
    <Panel title="Beatport">
      <div className="settings-form">
        <p className="cp-beatport-settings__lead">
          Discover uses your own Beatport token to search Beatport. Without one, Discover can still
          open past runs and your wantlist.
        </p>
        <TextField
          label="Beatport token"
          id={fieldId}
          type="password"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            status.configured ? "Paste a new token to replace the saved one" : "Paste your Beatport access token"
          }
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
        {testMessage ? (
          <p
            className={`cp-beatport-settings__result cp-beatport-settings__result--${testOk ? "accepted" : testReason === "unreachable" ? "unreachable" : "rejected"}`}
            role="status"
          >
            {testOk
              ? "Accepted. Beatport took the token."
              : testReason === "rejected"
                ? `Beatport rejected the token. ${testMessage}`
                : testReason === "unreachable"
                  ? `Couldn't reach Beatport. ${testMessage}`
                  : testMessage}
          </p>
        ) : null}
        <details className="cp-beatport-settings__help">
          <summary>How do I get a token?</summary>
          <p>Beatport does not hand out tokens from your account page. You ask for API access, then exchange what they give you for a token.</p>
          <ol>
            <li>
              Fill in Beatport&apos;s API key request form (app name, what you will use it for) and
              wait for approval. Beatport sends you a client ID, and possibly a client secret.
            </li>
            <li>
              Use your client ID to get an access token from Beatport: the password flow if you have
              a client secret, the authorization code flow if you have only a client ID. The token is
              the <code>access_token</code> value in Beatport&apos;s answer. Keep your client secret
              private.
            </li>
            <li>Paste the token above, choose Save token, then Test connection.</li>
          </ol>
          <p>A token expires after a while. When Discover says Beatport rejected it, get a new one and save it.</p>
        </details>
      </div>
    </Panel>
  );
}
