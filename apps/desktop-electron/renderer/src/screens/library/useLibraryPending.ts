import { useCallback, useEffect, useState } from "react";

import type { LibraryPending } from "../../api/cuepointBridge.types";
import { reportUnexpected } from "../../reporting/reporting";

/**
 * What the Library holds that is not out in the world yet (M511): values CuePoint has that the
 * audio files do not, and changes since the last Rekordbox export. Asked of the engine, never
 * counted here, and asked again when `refreshKey` changes and when the window is looked at again
 * (an edit elsewhere, an export, a sync). Null while unknown or with no engine to ask.
 *
 * `refreshKey` is compared by its value, not its identity: a caller passes a new array each render,
 * and asking on every render sent about 140 requests a second during an import, which used up
 * Windows' local ports and failed every engine call after them.
 */
export function useLibraryPending(refreshKey: unknown): LibraryPending | null {
  const [pending, setPending] = useState<LibraryPending | null>(null);

  const read = useCallback(() => {
    const ask = window.cuepoint?.getLibraryPending;
    if (!ask) return () => {};
    let current = true;
    ask()
      .then((answer) => {
        if (current) setPending(answer);
      })
      .catch((error: unknown) => {
        // A line that cannot be read is no line, not an error screen.
        reportUnexpected(error);
      });
    return () => {
      current = false;
    };
  }, []);

  const key = JSON.stringify(refreshKey ?? null);
  useEffect(() => read(), [read, key]);
  useEffect(() => {
    let stop = () => {};
    const onFocus = () => {
      stop();
      stop = read();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      stop();
    };
  }, [read]);

  return pending;
}
