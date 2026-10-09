import { useEffect, useState } from "react";

import type { UpdateState } from "../../api/cuepointBridge.types";

/**
 * The updater's state (DIST-06): read once on mount, then every change main pushes.
 * Null until it is known, and for good where there is no bridge (a browser tab, a test), which
 * the update screens read as "nothing to show".
 */
export function useUpdateState(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null);

  useEffect(() => {
    const updates = window.cuepoint?.updates;
    if (!updates) return;
    let live = true;
    // A push is newer than a read that was started before it.
    let pushed = false;
    const stop = updates.subscribe((next) => {
      pushed = true;
      if (live) setState(next);
    });
    void updates
      .getState()
      .then((read) => {
        if (live && !pushed) setState(read);
      })
      .catch(() => {
        // Without a state the screens show nothing.
      });
    return () => {
      live = false;
      stop();
    };
  }, []);

  return state;
}
