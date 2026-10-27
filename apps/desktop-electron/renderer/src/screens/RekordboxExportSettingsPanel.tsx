import { useNavigate } from "react-router-dom";

import type { RekordboxExportHistory } from "../api/cuepointBridge.types";
import { exportHistory, useReportReadError, useSharedRead } from "../api/sharedReads";
import { Button, Loading, Notice, Panel } from "../components";
import { displayPath } from "../format/paths";
import { RETRY } from "../format/words";
import { fileName } from "./library/libraryFormat";
import { libraryImportState } from "./library/libraryLink";
import {
  historyOutcome,
  historyWhen,
  rememberedFolderLine,
} from "./library/rekordboxExport";
import { SettingsActions, SettingsHint, SettingsStatus } from "./SettingsParts";
import "./rekordbox-export-settings.css";
import { needsDesktopApp, userMessage } from "../api/userMessage";

/** The notation exports are written in, as a sentence (M437). */
function exportKeyWords(format: string): string {
  switch (format) {
    case "camelot":
      return "Exports write keys as Camelot, like 8A.";
    case "short":
      return "Exports write keys in short form, like Amin.";
    default:
      return "Exports write keys in Rekordbox\u2019s own notation, like Am or C#.";
  }
}

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

        {/* One label above its value, as every other section writes a field (M231); the folder in the
            computer's own separators with "~" for home (M500). */}
        {remembered?.folder && (
          <div className="cp-export-settings__fact">
            <span className="cp-text-label">Save dialog opens in</span>
            <p
              className="cp-export-settings__value"
              data-testid="export-remembered-folder"
              data-hint={displayPath(remembered.folder, { keepHome: true })}
            >
              {remembered.folder_exists ? displayPath(remembered.folder) : rememberedFolderLine(remembered)}
            </p>
          </div>
        )}

        {/* A sentence, not a second setting beside "Keys written as" (M437): exports keep their own notation. */}
        {remembered && (
          <SettingsHint className="cp-export-settings__notation" data-testid="export-remembered-notation">
            {exportKeyWords(remembered.key_format)}
          </SettingsHint>
        )}

        <SettingsHint>
          To export, use &ldquo;Export to Rekordbox&hellip;&rdquo; in the Library or on a Collection&apos;s menu.
        </SettingsHint>

        {history && (
          <section aria-label="Recent exports">
            <h3 className="cp-export-settings__heading cp-text-label">Recent exports</h3>
            {history.exports.length === 0 ? (
              <SettingsHint>
                {remembered?.folder ? "No exports yet." : "No exports yet. The first one is saved in Documents."}
              </SettingsHint>
            ) : (
              <ul className="cp-export-settings__list">
                {history.exports.map((record) => (
                  <li
                    key={record.id}
                    data-outcome={record.outcome}
                    className="cp-export-settings__item"
                  >
                    <span className="cp-export-settings__when">{historyWhen(record)}</span>
                    <span className="cp-export-settings__file" data-hint={displayPath(record.destination_path, { keepHome: true })}>
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
            Change file…
          </Button>
        </SettingsActions>
      </div>
    </Panel>
  );
}
