import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../../components";
import { settingsFocusState } from "../settingsLink";

interface BeatportSignInButtonProps {
  /** "Sign in to Beatport" or "Sign in again". */
  label: string;
  /** Called when the sign-in window has closed, so the page asks Beatport again. */
  onDone: () => void;
}

/**
 * Opens the Beatport sign-in window (C12) from the page that needs it. Main does the signing in;
 * this only asks for it, waits while the window is open, and tells the page when it is over.
 * Without the desktop bridge there is no window to open, so it goes to Settings instead.
 */
export function BeatportSignInButton({ label, onDone }: BeatportSignInButtonProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const signIn = async () => {
    const bridge = window.cuepoint?.beatportSignIn;
    if (!bridge) {
      navigate("/settings", { state: settingsFocusState("beatport-token") });
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      // A token from the environment outranks any sign-in, so a window would change nothing.
      const current = await window.cuepoint?.getBeatportAuth?.().catch(() => null);
      if (current?.state === "env") {
        navigate("/settings", { state: settingsFocusState("beatport-token") });
        return;
      }
      await bridge();
      onDone();
    } catch {
      setProblem("Couldn't open the Beatport sign-in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {problem ? <span role="alert">{problem}</span> : null}
      <Button variant="primary" disabled={busy} onClick={() => void signIn()}>
        {label}
      </Button>
    </>
  );
}
