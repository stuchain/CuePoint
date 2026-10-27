import { useEffect, useState } from "react";

/**
 * Whether CuePoint is signed in to Beatport, for the status strip (M522, D25): `null` until the
 * first answer or with no bridge (the strip then says nothing), else true or false.
 *
 * Read once through `getBeatportAuth` and then followed through main's announcements. An older
 * bridge without it falls back to whether a token is saved.
 */
export function useBeatportSignIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    const cuepoint = window.cuepoint;
    if (!cuepoint) return;
    let current = true;
    // An announcement is newer than the first read, which may answer after it.
    let heardEvent = false;
    const apply = (state: string) => {
      if (current) setSignedIn(state === "signed_in" || state === "pasted" || state === "env");
    };
    if (!cuepoint.getBeatportAuth) {
      cuepoint
        .getBeatportTokenStatus?.()
        .then((status) => {
          if (current) setSignedIn(status.configured);
        })
        .catch(() => undefined);
      return () => {
        current = false;
      };
    }
    cuepoint
      .getBeatportAuth()
      .then((auth) => {
        if (!heardEvent) apply(auth.state);
      })
      // Not knowing is not "signed out": the strip stays quiet about it.
      .catch(() => undefined);
    const unsubscribe = cuepoint.onBeatportAuthChanged?.((auth) => {
      heardEvent = true;
      apply(auth.state);
    });
    return () => {
      current = false;
      unsubscribe?.();
    };
  }, []);
  return signedIn;
}
