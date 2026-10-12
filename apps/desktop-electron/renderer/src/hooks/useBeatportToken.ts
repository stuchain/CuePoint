import { useCallback, useEffect, useState } from "react";
import type {
  BeatportAuth,
  BeatportTokenStatus,
  BeatportTokenTestResult,
} from "../api/cuepointBridge.types";
import { hasEngineBridge } from "../api/cuepointBridge.types";

/** What Settings shows when there is no desktop bridge, or main cannot answer. */
const SIGNED_OUT: BeatportAuth = {
  state: "signed_out",
  masked: null,
  expires_at: null,
  secure_storage: true,
};

/** Whether the paste field is the way to a token: signed out, ended, or no sign-in available. */
function canPasteIn(state: BeatportAuth["state"]): boolean {
  return state === "signed_out" || state === "expired" || state === "unavailable";
}

/**
 * The Beatport sign-in and the token behind it. The sign-in itself lives in main (C12); this
 * only asks for it and shows its state. No token is ever held here except the one being pasted.
 */
export function useBeatportToken() {
  const engineAvailable = hasEngineBridge();
  const [status, setStatus] = useState<BeatportTokenStatus>({
    configured: false,
    masked: null,
  });
  // Null until main has answered (or there is no main to ask), so the page shows neither state
  // before it knows which one is true.
  const [auth, setAuth] = useState<BeatportAuth | null>(null);
  // The sign-in window is open (or a sign-out is running): its buttons wait.
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // One line saying why a sign-in, sign-out or paste did not work; null otherwise.
  const [authError, setAuthError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  // Whether the status has been read once: until then the field is about to
  // be disabled for the read, and anything that focuses it would lose focus.
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  // Whether Beatport accepted the token the last test used; null before a test.
  const [testOk, setTestOk] = useState<boolean | null>(null);
  // Why the last test failed: Beatport said no, or it could not be reached.
  const [testReason, setTestReason] = useState<BeatportTokenTestResult["reason"] | null>(null);

  const refresh = useCallback(async () => {
    if (!window.cuepoint?.getBeatportTokenStatus) {
      setStatus({ configured: false, masked: null });
      return;
    }
    setLoading(true);
    try {
      const next = await window.cuepoint.getBeatportTokenStatus();
      setStatus(next);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (engineAvailable) {
      void refresh();
    }
  }, [engineAvailable, refresh]);

  // The sign-in state, read once and then followed: main announces every change, including a
  // renewal that happens while Settings is open. The token status follows each change.
  useEffect(() => {
    const cuepoint = window.cuepoint;
    let current = true;
    if (!cuepoint?.getBeatportAuth) {
      setAuth(SIGNED_OUT);
      return;
    }
    const apply = (next: BeatportAuth): void => {
      if (!current) return;
      setAuth(next);
      // A half-typed token is dropped once the field is no longer the way in.
      if (!canPasteIn(next.state)) setDraft("");
      void refresh();
    };
    cuepoint
      .getBeatportAuth()
      .then((next) => {
        if (current) setAuth(next);
      })
      .catch(() => {
        if (current) setAuth(SIGNED_OUT);
      });
    const unsubscribe = cuepoint.onBeatportAuthChanged?.(apply);
    return () => {
      current = false;
      unsubscribe?.();
    };
  }, [refresh]);

  const signIn = useCallback(async () => {
    if (!window.cuepoint?.beatportSignIn) {
      setAuthError("Open CuePoint as a desktop app to sign in.");
      return null;
    }
    setSigningIn(true);
    setAuthError(null);
    try {
      const next = await window.cuepoint.beatportSignIn();
      setAuth(next);
      if (!canPasteIn(next.state)) setDraft("");
      await refresh();
      return next;
    } catch {
      setAuthError("Couldn't open the Beatport sign-in. Try again.");
      return null;
    } finally {
      setSigningIn(false);
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (!window.cuepoint?.beatportSignOut) return null;
    setSigningOut(true);
    setAuthError(null);
    try {
      const next = await window.cuepoint.beatportSignOut();
      setAuth(next);
      setTestMessage(null);
      setTestOk(null);
      setTestReason(null);
      await refresh();
      return next;
    } catch {
      setAuthError("Couldn't sign out. Try again.");
      return null;
    } finally {
      setSigningOut(false);
    }
  }, [refresh]);

  // The paste fallback goes to main, which encrypts it; the engine never writes it to a file.
  const savePasted = useCallback(async () => {
    if (!window.cuepoint?.saveBeatportPastedToken) {
      setAuthError("Open CuePoint as a desktop app to save a token.");
      return null;
    }
    const token = draft.trim();
    if (!token) return null;
    setSaving(true);
    setAuthError(null);
    try {
      const next = await window.cuepoint.saveBeatportPastedToken(token);
      setAuth(next);
      setDraft("");
      setTestMessage(null);
      setTestOk(null);
      setTestReason(null);
      await refresh();
      return next;
    } catch {
      setAuthError("Couldn't save the token. Try again.");
      return null;
    } finally {
      setSaving(false);
    }
  }, [draft, refresh]);

  // `useDraft` is for the paste field's own button: it tests what is typed there. The signed-in
  // and environment buttons test the token CuePoint holds, whatever the field holds.
  const test = useCallback(async (useDraft = false) => {
    if (!window.cuepoint?.testBeatportToken) {
      throw new Error("Open CuePoint as a desktop app to test a token.");
    }
    setTesting(true);
    setTestMessage(null);
    setTestOk(null);
    setTestReason(null);
    try {
      const result = await window.cuepoint.testBeatportToken(
        useDraft && draft.trim() ? { token: draft.trim() } : undefined,
      );
      setTestMessage(result.message);
      setTestOk(result.ok);
      setTestReason(result.reason ?? null);
      return result;
    } finally {
      setTesting(false);
    }
  }, [draft]);

  return {
    engineAvailable,
    status,
    auth,
    canPaste: auth ? canPasteIn(auth.state) : false,
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
    refresh,
    savePasted,
    test,
  };
}
