import { useEffect, useRef, useState } from "react";

import { Panel } from "../components";
import { reportUnexpected, setReportingChoice } from "../reporting/reporting";
import "./error-reporting-settings.css";

/** The switch's id: what Help → Privacy's "Change in Settings" focuses. */
export const ERROR_REPORTING_FIELD_ID = "settings-error-reporting";

interface ErrorReportingSettingsPanelProps {
  /** Opens Help → Privacy, which shows the same state and links back. */
  onOpenPrivacy?: () => void;
  /** One per navigation that asked for the switch; it is focused once, when it can take focus. */
  focusToken?: string | null;
}

/**
 * Settings → Privacy (REPORT-01, DEC-128).
 *
 * One switch for error reports, read from and written through the bridge,
 * which stores it in Electron main and tells the engine. The answered state is
 * the one shown; a refusal puts the switch back and says why.
 */
export function ErrorReportingSettingsPanel({ onOpenPrivacy, focusToken = null }: ErrorReportingSettingsPanelProps) {
  const reporting = window.cuepoint?.errorReporting;
  const available = reporting !== undefined;
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(available);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.cuepoint?.errorReporting;
    if (!bridge) return;
    let live = true;
    bridge
      .get()
      .then((state) => {
        if (live) setEnabled(state.enabled);
      })
      .catch((reason: unknown) => {
        reportUnexpected(reason);
        if (live) setError(reason instanceof Error ? reason.message : "Could not read the setting.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  // Focused once its state is read: a disabled switch cannot take focus.
  const focused = useRef<string | null>(null);
  const ready = available && !loading;
  useEffect(() => {
    if (!focusToken || !ready || focused.current === focusToken) return;
    focused.current = focusToken;
    const field = document.getElementById(ERROR_REPORTING_FIELD_ID);
    field?.scrollIntoView?.({ block: "center" });
    field?.focus();
  }, [focusToken, ready]);

  const toggle = async (next: boolean) => {
    if (!reporting) return;
    const before = enabled;
    setBusy(true);
    setError(null);
    setEnabled(next);
    try {
      const answered = (await reporting.set(next)).enabled;
      // The page's own reporter follows at once (REPORT-06): no more steps or reports.
      setReportingChoice(answered);
      setEnabled(answered);
    } catch (reason) {
      reportUnexpected(reason);
      setEnabled(before);
      setError(reason instanceof Error ? reason.message : "Could not change the setting.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Privacy">
      <div className="cp-error-reporting">
        <label className="cp-error-reporting__toggle">
          <input
            id={ERROR_REPORTING_FIELD_ID}
            type="checkbox"
            role="switch"
            checked={enabled}
            disabled={!available || loading || busy}
            onChange={(event) => void toggle(event.target.checked)}
          />
          <span>Send error reports</span>
        </label>
        <p className="cp-error-reporting__text">
          A report says what went wrong, where in CuePoint&apos;s code, and the steps that led to it.
          It is built not to carry your file, folder, track, artist, label or playlist names, your
          notes, tags or tokens: they are removed on your computer before it is sent.
        </p>
        {!available && (
          <p className="cp-error-reporting__text">Open CuePoint as a desktop app to change this.</p>
        )}
        {error && (
          <p className="cp-error-reporting__error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="cp-error-reporting__link" onClick={() => onOpenPrivacy?.()}>
          Privacy details
        </button>
      </div>
    </Panel>
  );
}
