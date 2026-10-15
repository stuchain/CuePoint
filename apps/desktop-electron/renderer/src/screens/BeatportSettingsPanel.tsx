import { useEffect, useId, useRef } from "react";

import { Button, MoreAbout, Panel, TextField } from "../components";
import type { BeatportAuth } from "../api/cuepointBridge.types";
import { NEEDS_DESKTOP } from "../api/userMessage";
import { useBeatportToken } from "../hooks/useBeatportToken";
import { useIncludeUserCharts } from "./discover/includeUserCharts";
import "./beatport-settings.css";

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
        <div className="settings-form">
          <p className="cp-beatport-settings__lead">Checking Beatport…</p>
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
  const signInLabel = state === "expired" ? "Sign in again" : "Sign in to Beatport";
  const noDesktop = !engineAvailable;

  const tokenHint = engineAvailable
    ? status.configured
      ? `Saved token ${status.masked ?? ""}. Paste a new one to replace it.`
      : "Kept on this computer only."
    : NEEDS_DESKTOP;

  const settled = (): void => lineRef.current?.focus();

  const testResult = testMessage ? (
    <p
      className={`cp-beatport-settings__result cp-beatport-settings__result--${testOk ? "accepted" : testReason === "unreachable" ? "unreachable" : "rejected"}`}
      role="status"
    >
      {testOk
        ? "Connected. Beatport let CuePoint in."
        : testReason === "rejected"
          ? `Beatport refused the sign-in. ${testMessage}`
          : testReason === "unreachable"
            ? `Couldn't reach Beatport. ${testMessage}`
            : testMessage}
    </p>
  ) : null;

  return (
    <Panel title="Beatport">
      <div className="settings-form">
        <p id={lineId} ref={lineRef} tabIndex={-1} className="cp-beatport-settings__lead">
          {line}
        </p>
        {fromConfig ? (
          <p className="cp-beatport-settings__lead">
            Using the sign-in saved in CuePoint&apos;s config file · {status.masked ?? "••••"}
          </p>
        ) : null}
        {!env && !auth.secure_storage ? (
          <p className="cp-beatport-settings__lead">
            This system has no secure key store, so you sign in again each time CuePoint starts.
          </p>
        ) : null}
        {noDesktop ? (
          <p className="cp-beatport-settings__lead">{NEEDS_DESKTOP}</p>
        ) : null}
        {signingIn ? (
          <p className="cp-beatport-settings__lead" role="status">
            Finish signing in in the Beatport window.
          </p>
        ) : null}
        {authError ? (
          <p className="cp-beatport-settings__result cp-beatport-settings__result--rejected" role="alert">
            {authError}
          </p>
        ) : null}
        <div className="match-actions">
          {signedIn || env ? (
            <>
              <Button
                variant="secondary"
                loading={testing}
                disabled={noDesktop}
                onClick={() => void test()}
              >
                Test connection
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
        </div>
        {!showPaste ? testResult : null}
        {showPaste ? (
          <MoreAbout label="Paste a token instead" describedBy={lineId} defaultOpen={focusToken !== null}>
            <div className="settings-form">
              <p className="cp-beatport-settings__lead">
                Without a sign-in, past digs and wantlist still open.
              </p>
              <TextField
                label="Beatport token"
                id={fieldId}
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
              <div className="match-actions">
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
                    Test connection
                  </Button>
                ) : null}
              </div>
              {signedOutOrEnded ? testResult : null}
            </div>
          </MoreAbout>
        ) : null}
        {replacing ? testResult : null}
        <div className="cp-beatport-settings__choice">
          <label className="cp-beatport-settings__option">
            <input
              type="checkbox"
              checked={includeUsers}
              onChange={(event) => setIncludeUsers(event.target.checked)}
            />
            <span>Include charts by regular Beatport users</span>
          </label>
          <p className="cp-beatport-settings__hint">
            A Discover dig with no artists chosen reads the charts artists made, as Beatport&apos;s
            genre charts page lists them. Turn this on to read charts by ordinary Beatport users
            too; there are many more, so the dig takes longer.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/** The one line that says where the sign-in stands. */
function lineFor(state: BeatportAuth["state"], masked: string | null): string {
  const tail = masked ? ` · ${masked}` : "";
  switch (state) {
    case "signed_in":
      return `Signed in to Beatport${tail} · renews by itself`;
    case "pasted":
      return `Using a pasted token${tail}`;
    case "expired":
      return "Beatport sign-in ended";
    case "env":
      return "Using BEATPORT_ACCESS_TOKEN from the environment";
    case "unavailable":
      return "Signing in to Beatport isn't available on this system.";
    case "signed_out":
      return "Sign in to let Discover search Beatport.";
  }
}
