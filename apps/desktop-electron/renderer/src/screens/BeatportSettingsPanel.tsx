import { useEffect, useId, useRef } from "react";

import { Button, Loading, MoreAbout, Notice, Panel, TextField } from "../components";
import type { BeatportAuth } from "../api/cuepointBridge.types";
import { needsDesktopApp } from "../api/userMessage";
import { useBeatportToken } from "../hooks/useBeatportToken";
import { useIncludeUserCharts } from "./discover/includeUserCharts";
import { ResetToDefaults } from "./ResetToDefaults";
import { PanelTools, SettingsActions, SettingsHint, SettingsStatus } from "./SettingsParts";

interface BeatportSettingsPanelProps {
  /** The token field's id: what Discover's Open Settings link focuses. */
  fieldId: string;
  /** One per navigation that asked for the field; it is focused once, when it can take focus. */
  focusToken?: string | null;
}

/**
 * Settings → Beatport (SET-5, C12): whether CuePoint is signed in to Beatport, which is what lets
 * Discover search it, and whether Beatport accepts the sign-in. The sign-in is a window of its own
 * that main opens; pasting a token stays as the way around it. The token never reaches this page
 * except the one being pasted.
 */
export function BeatportSettingsPanel({ fieldId, focusToken = null }: BeatportSettingsPanelProps) {
  const {
    engineAvailable,
    status,
    auth,
    canPaste: signedOutOrEnded,
    signingIn,
    signingOut,
    authError,
    signIn,
    signOut,
    draft,
    setDraft,
    loading,
    loaded,
    saving,
    testing,
    testMessage,
    testOk,
    testReason,
    savePasted,
    test,
  } = useBeatportToken();
  const [includeUsers, setIncludeUsers] = useIncludeUserCharts();
  const lineId = useId();
  const lineRef = useRef<HTMLParagraphElement>(null);

  // Discover and the Library link here, to the token field (DISCOVER-10). Scrolled to and
  // focused once per navigation — once its status and the sign-in state have been read: the
  // field is disabled while it loads, and a field disabled after it was focused loses the focus
  // without a word.
  const focused = useRef<string | null>(null);
  const fieldReady = engineAvailable && loaded && !loading && auth !== null;
  useEffect(() => {
    if (!focusToken || !fieldReady || focused.current === focusToken) return;
    focused.current = focusToken;
    const field = document.getElementById(fieldId);
    field?.scrollIntoView?.({ block: "center" });
    field?.focus();
  }, [fieldReady, fieldId, focusToken]);

  if (auth === null) {
    return (
      <Panel title="Beatport">
        <div className="settings-body">
          <Loading what="the Beatport sign-in" />
        </div>
      </Panel>
    );
  }

  const { state, masked } = auth;
  const signedIn = state === "signed_in" || state === "pasted";
  const env = state === "env";
  // Linked to from somewhere that wants the token field: a signed-in person may replace the token.
  const replacing = signedIn && focusToken !== null;
  const showPaste = signedOutOrEnded || replacing;
  const line = lineFor(state, masked);
  const fromConfig = !signedIn && !env && status.configured && status.source === "config";
  const signInLabel = "Sign in to Beatport";
  const noDesktop = !engineAvailable;

  const tokenHint = engineAvailable
    ? status.configured
      ? `Saved token ${status.masked ?? ""}. Paste a new one to replace it.`
      : "Kept on this computer only."
    : needsDesktopApp();

  const settled = (): void => lineRef.current?.focus();

  const testResult = testMessage ? (
    <SettingsStatus
      role="status"
      tone={testOk ? "success" : testReason === "unreachable" ? "warning" : "danger"}
    >
      {testOk
        ? "Connected. Beatport let CuePoint in."
        : testReason === "rejected"
          ? `Beatport refused the sign-in. ${testMessage}`
          : testReason === "unreachable"
            ? `Could not reach Beatport. ${testMessage}`
            : testMessage}
    </SettingsStatus>
  ) : null;

  // Reset: the one setting here, the charts by regular users, goes back to off.
  const resetToDefaults = () => {
    const before = includeUsers;
    setIncludeUsers(false);
    return () => setIncludeUsers(before);
  };

  return (
    <Panel
      title="Beatport"
      badge={<PanelTools reset={<ResetToDefaults section="Beatport" onReset={resetToDefaults} />} />}
    >
      <div className="settings-body">
        <SettingsStatus id={lineId} ref={lineRef} tabIndex={-1}>
          {line}
        </SettingsStatus>
        {fromConfig ? (
          <SettingsStatus>
            Using a Beatport sign-in saved earlier · {status.masked ?? "••••"}
          </SettingsStatus>
        ) : null}
        {!env && !auth.secure_storage ? (
          <SettingsStatus>
            This system has no secure key store, so you sign in again each time CuePoint starts.
          </SettingsStatus>
        ) : null}
        {noDesktop ? <SettingsStatus>{needsDesktopApp()}</SettingsStatus> : null}
        {signingIn ? <SettingsStatus role="status">Finish signing in in the Beatport window.</SettingsStatus> : null}
        {authError ? (
          <Notice kind="danger">{authError}</Notice>
        ) : null}
        {!showPaste ? testResult : null}
        {showPaste ? (
          <MoreAbout label="Paste a token instead" describedBy={lineId} defaultOpen={focusToken !== null}>
            <div className="settings-body">
              <SettingsHint>Without a sign-in, past digs and wantlist still open.</SettingsHint>
              <TextField
                label="Beatport token"
                id={fieldId}
                width="full"
                type="password"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  status.configured
                    ? "Paste a new token to replace the saved one"
                    : "Paste your Beatport access token"
                }
                hint={loading ? "Loading token status…" : tokenHint}
                disabled={noDesktop || loading}
              />
              <div className="settings-actions__main">
                <Button
                  variant="primary"
                  loading={saving}
                  disabled={noDesktop || !draft.trim() || signingIn}
                  onClick={() => void savePasted()}
                >
                  Save token
                </Button>
                {signedOutOrEnded ? (
                  <Button
                    variant="secondary"
                    loading={testing}
                    disabled={noDesktop || (!draft.trim() && !status.configured)}
                    onClick={() => void test(true)}
                  >
                    Check sign-in
                  </Button>
                ) : null}
              </div>
              {signedOutOrEnded ? testResult : null}
            </div>
          </MoreAbout>
        ) : null}
        {replacing ? testResult : null}
        <div className="cp-beatport-settings__choice settings-option">
          <label className="cp-beatport-settings__option settings-check">
            <input
              type="checkbox"
              checked={includeUsers}
              onChange={(event) => setIncludeUsers(event.target.checked)}
            />
            <span>Include charts by regular Beatport users</span>
          </label>
          <SettingsHint>
            Also read charts made by Beatport users who are not artists. Digs take longer.
          </SettingsHint>
        </div>
        <SettingsActions>
          {signedIn || env ? (
            <>
              <Button
                variant="secondary"
                loading={testing}
                disabled={noDesktop}
                onClick={() => void test()}
              >
                Check sign-in
              </Button>
              {signedIn ? (
                <Button
                  variant="secondary"
                  loading={signingOut}
                  disabled={noDesktop}
                  onClick={() => void signOut().then(settled)}
                >
                  Sign out
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              variant="primary"
              disabled={noDesktop || state === "unavailable" || signingIn || signingOut}
              onClick={() => void signIn().then(settled)}
            >
              {signInLabel}
            </Button>
          )}
        </SettingsActions>
      </div>
    </Panel>
  );
}

/**
 * The one line that says where the sign-in stands. A pasted one reads as the sign-in it is, with
 * how it differs, and not as a token (C178); the masked end tells one sign-in from the next.
 */
function lineFor(state: BeatportAuth["state"], masked: string | null): string {
  const tail = masked ? ` · ${masked}` : "";
  switch (state) {
    case "signed_in":
      return `Signed in to Beatport${tail} · renews by itself`;
    case "pasted":
      return `Signed in to Beatport${tail} · pasted by hand`;
    case "expired":
      return "Beatport sign-in ended";
    case "env":
      return "Using a Beatport sign-in set outside CuePoint";
    case "unavailable":
      return "Signing in to Beatport is not available on this system.";
    case "signed_out":
      return "Sign in to let Discover search Beatport.";
  }
}
