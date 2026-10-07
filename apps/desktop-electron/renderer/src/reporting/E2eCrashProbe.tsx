import { useEffect, useState } from "react";

/** The event an end-to-end run dispatches to make the page it is on throw. */
export const E2E_CRASH_EVENT = "cuepoint:e2e-crash";

/**
 * Renders nothing. In an end-to-end run only (main answers `testHooks.enabled()` true
 * only then), a `cuepoint:e2e-crash` event makes this throw while rendering, so the
 * spec can see the page's error screen. In a user's build the bridge answers false and
 * no listener is ever added.
 */
/** Asked once per page load, not on every page the user opens. */
let asked: Promise<boolean> | null = null;

/** Forget the answer; for tests. */
export function resetE2eCrashProbe(): void {
  asked = null;
}

function testRun(): Promise<boolean> {
  if (asked === null) {
    const hooks = window.cuepoint?.testHooks;
    asked = hooks ? hooks.enabled().then((enabled) => enabled === true, () => false) : Promise.resolve(false);
  }
  return asked;
}

export function E2eCrashProbe() {
  const [crash, setCrash] = useState(false);

  useEffect(() => {
    let live = true;
    let listening = false;
    const onCrash = () => setCrash(true);
    void testRun().then((enabled) => {
      if (!live || !enabled) return;
      listening = true;
      window.addEventListener(E2E_CRASH_EVENT, onCrash);
    });
    return () => {
      live = false;
      if (listening) window.removeEventListener(E2E_CRASH_EVENT, onCrash);
    };
  }, []);

  if (crash) throw new Error("End-to-end test crash");
  return null;
}
