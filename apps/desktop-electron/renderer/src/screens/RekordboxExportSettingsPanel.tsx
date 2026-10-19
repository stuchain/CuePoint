import { useId } from "react";
import { useNavigate } from "react-router-dom";

import type { RekordboxExportHistory } from "../api/cuepointBridge.types";
import { exportHistory, useReportReadError, useSharedRead } from "../api/sharedReads";
import { Button, Loading, MoreAbout, Notice, Panel } from "../components";
import { RETRY } from "../format/words";
import { fileName } from "./library/libraryFormat";
import { libraryImportState } from "./library/libraryLink";
import {
  historyOutcome,
  historyWhen,
  keyFormatLabel,
  rememberedFolderLine,
} from "./library/rekordboxExport";
import { SettingsActions, SettingsHint, SettingsStatus } from "./SettingsParts";
import "./rekordbox-export-settings.css";
import { needsDesktopApp, userMessage } from "../api/userMessage";

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
  // The history is read through the shared cache (C19d): Settings shown again has
  // it at once, and it is read again when an export finishes or the library changes.
  const read = useSharedRead(exportHistory(SETTINGS_HISTORY_LIMIT));
  useReportReadError(read.error);
  const history: RekordboxExportHistory | null = read.value ?? null;
  const error =
    read.error !== undefined ? userMessage(read.error, "Could not read the export history.") : null;
  const loading = read.loading;
  const available = !read.unavailable;
  const load = read.refresh;

  const navigate = useNavigate();
  const lineId = useId();
  const remembered = history?.remembered ?? null;

  return (
    <Panel title="Rekordbox">
      <div className="cp-export-settings">
        {!available && (
          <SettingsStatus>{needsDesktopApp("Showing where exports go")}</SettingsStatus>
        )}

        {error && (
          <Notice
            kind="danger"
            action={
              <Button variant="secondary" onClick={load}>
                {RETRY}
              </Button>
            }
          >
            {error}
          </Notice>
        )}

        {loading && !history && <Loading what="past exports" />}

        {remembered && (
          <dl className="cp-facts">
            <dt>Save dialog opens in</dt>
            <dd data-testid="export-remembered-folder" data-hint={remembered.folder ?? undefined}>
              {rememberedFolderLine(remembered)}
            </dd>
            <dt>Key notation</dt>
            <dd data-testid="export-remembered-notation">{keyFormatLabel(remembered.key_format)}</dd>
          </dl>
        )}

        <SettingsHint id={lineId}>Remembers your last export.</SettingsHint>
        <MoreAbout describedBy={lineId}>
          <SettingsHint>
            To export, use “Export to Rekordbox…” in the Library or on a Collection&apos;s menu.
          </SettingsHint>
        </MoreAbout>

        {history && (
          <section aria-label="Recent exports">
            <h3 className="cp-export-settings__heading cp-text-label">Recent exports</h3>
            {history.exports.length === 0 ? (
              <SettingsHint>No exports yet.</SettingsHint>
            ) : (
              <ul className="cp-export-settings__list">
                {history.exports.map((record) => (
                  <li
                    key={record.id}
                    data-outcome={record.outcome}
                    className="cp-export-settings__item"
                  >
                    <span className="cp-export-settings__when">{historyWhen(record)}</span>
                    <span className="cp-export-settings__file" data-hint={record.destination_path}>
                      {fileName(record.destination_path)}
                    </span>
                    <span className="cp-export-settings__outcome">{historyOutcome(record)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <SettingsHint>Read a different Rekordbox file in place of the current one.</SettingsHint>
        <SettingsActions>
          <Button
            variant="secondary"
            onClick={() => navigate("/library", { state: libraryImportState() })}
          >
            Import a Rekordbox file…
          </Button>
        </SettingsActions>
      </div>
    </Panel>
  );
}
