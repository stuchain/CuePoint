import { useCallback, useEffect, useState } from "react";

import type { RekordboxExportHistory } from "../api/cuepointBridge.types";
import { Button, Panel } from "../components";
import { fileName } from "./library/libraryFormat";
import {
  historyOutcome,
  historyWhen,
  keyFormatLabel,
  rememberedFolderLine,
} from "./library/rekordboxExport";
import "./rekordbox-export-settings.css";

/** How many past exports Settings lists. */
export const SETTINGS_HISTORY_LIMIT = 10;

/**
 * The Rekordbox export, as Settings shows it (EXPORT-07, DEC-087).
 *
 * Where the next export's save dialog opens, the notation it starts in, and
 * the recent exports — all read from the export record (DEC-083, DEC-086), so
 * this cannot disagree with where the last export actually went.
 *
 * **It shows rather than holds.** Both remembered values are the last written
 * export's, and change by exporting: a folder chosen in the save dialog, a
 * notation chosen in the export dialog. A second, editable copy here would be
 * a second store that could drift from the record, which is the reason
 * EXPORT-06 did not keep one.
 *
 * **It offers no way to start an export.** DEC-087 puts export where the scope
 * is in view — the Library header and a Collection's menu — and says so here,
 * so someone who looked for it in Settings learns where it lives.
 */
export function RekordboxExportSettingsPanel() {
  const [history, setHistory] = useState<RekordboxExportHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const read = window.cuepoint?.getRekordboxExportHistory;
  const available = Boolean(read);

  const load = useCallback(async () => {
    const bridge = window.cuepoint?.getRekordboxExportHistory;
    if (!bridge) return;
    setLoading(true);
    try {
      setHistory(await bridge({ limit: SETTINGS_HISTORY_LIMIT }));
      setError(null);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not read the export history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remembered = history?.remembered ?? null;

  return (
    <Panel title="Rekordbox export">
      <div className="cp-export-settings">
        <p className="cp-export-settings__hint">
          Export from the Library: “Export to Rekordbox…” beside Import, or on a Collection’s
          menu. These are remembered from your last export; exporting somewhere else, or in
          another notation, changes them.
        </p>

        {!available && (
          <p className="cp-export-settings__hint">
            Open CuePoint as a desktop app to see where exports go.
          </p>
        )}

        {error && (
          <div className="cp-export-settings__problem" role="alert">
            <span>{error}</span>
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {remembered && (
          <dl className="cp-export-settings__facts">
            <div>
              <dt>Save dialog opens in</dt>
              <dd data-testid="export-remembered-folder" title={remembered.folder ?? undefined}>
                {rememberedFolderLine(remembered)}
              </dd>
            </div>
            <div>
              <dt>Key notation</dt>
              <dd data-testid="export-remembered-notation">
                {keyFormatLabel(remembered.key_format)}
              </dd>
            </div>
          </dl>
        )}

        {loading && !history && <p className="cp-export-settings__hint">Reading past exports…</p>}

        {history && (
          <section aria-label="Recent exports">
            <h3 className="cp-export-settings__heading">Recent exports</h3>
            {history.exports.length === 0 ? (
              <p className="cp-export-settings__hint">No exports yet.</p>
            ) : (
              <ul className="cp-export-settings__list">
                {history.exports.map((record) => (
                  <li
                    key={record.id}
                    data-outcome={record.outcome}
                    className="cp-export-settings__item"
                  >
                    <span className="cp-export-settings__when">{historyWhen(record)}</span>
                    <span className="cp-export-settings__file" title={record.destination_path}>
                      {fileName(record.destination_path)}
                    </span>
                    <span className="cp-export-settings__outcome">{historyOutcome(record)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Panel>
  );
}
