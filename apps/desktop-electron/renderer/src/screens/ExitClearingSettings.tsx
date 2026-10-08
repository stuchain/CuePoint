import { useEffect, useState } from "react";

import { SavedTick, useSavedSignal } from "../components/SavedTick";
import { onExitClearingChanged, readExitClearing, saveExitClearing } from "./exitClearing";
import "./error-reporting-settings.css";

/**
 * Settings → Privacy → "When CuePoint quits" (SET-7): clear the cache, the
 * logs, or both, each time CuePoint closes. The same two choices as Help →
 * Privacy, read and written through `exitClearing`, so both show one state.
 * A change applies at once.
 */
export function ExitClearingSettings() {
  const [choices, setChoices] = useState(readExitClearing);
  const [saved, markSaved] = useSavedSignal();

  // Read again on mount, and when Help → Privacy saves while this is open.
  useEffect(() => {
    setChoices(readExitClearing());
    return onExitClearingChanged(() => setChoices(readExitClearing()));
  }, []);

  const change = (next: Partial<typeof choices>) => {
    const merged = { ...choices, ...next };
    setChoices(merged);
    saveExitClearing(merged);
    markSaved();
  };

  return (
    <fieldset className="cp-error-reporting__exit">
      <legend>When CuePoint quits</legend>
      <label className="cp-error-reporting__toggle">
        <input
          type="checkbox"
          checked={choices.clearCache}
          onChange={(event) => change({ clearCache: event.target.checked })}
        />
        <span>Clear cache</span>
      </label>
      <label className="cp-error-reporting__toggle">
        <input
          type="checkbox"
          checked={choices.clearLogs}
          onChange={(event) => change({ clearLogs: event.target.checked })}
        />
        <span>Clear logs</span>
      </label>
      <SavedTick signal={saved} />
    </fieldset>
  );
}
