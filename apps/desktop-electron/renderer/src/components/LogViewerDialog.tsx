import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { Loading } from "./Loading";
import { Modal } from "./Modal";
import { Notice } from "./Notice";
import { SearchField } from "./SearchField";
import { Select } from "./Select";
import { useOptionalToast } from "./Toast";
import { reportUnexpected } from "../reporting/reporting";
import "./LogViewerDialog.css";
import { userMessage } from "../api/userMessage";
import { OPEN_LOG_FOLDER, couldNot } from "../format/words";
import { displayPathNameFirst } from "../format/paths";


const LEVEL_OPTIONS = ["All", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] as const;

/** The level as a word, not a shout: the log itself keeps the engine's own capitals (M264). */
const LEVEL_WORDS: Record<(typeof LEVEL_OPTIONS)[number], string> = {
  All: "All",
  DEBUG: "Debug",
  INFO: "Info",
  WARNING: "Warning",
  ERROR: "Error",
  CRITICAL: "Critical",
};

interface LogViewerDialogProps {
  open: boolean;
  onClose: () => void;
}

export function LogViewerDialog({ open, onClose }: LogViewerDialogProps) {
  const [level, setLevel] = useState<(typeof LEVEL_OPTIONS)[number]>("All");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logText, setLogText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const toast = useOptionalToast();

  const levelRequest = useMemo(() => (level === "All" ? undefined : level), [level]);

  const refresh = useCallback(async () => {
    if (!window.cuepoint?.getCuepointLog) {
      setLogText("Engine bridge unavailable (browser-only mode).");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await window.cuepoint.getCuepointLog({
        level: levelRequest,
        search: search || undefined,
        tailLines: 10_000,
        maxBytes: 5_000_000,
        sanitize: true,
      });
      setLogText(result.cuepoint_log ?? "");
    } catch (e) {
      reportUnexpected(e);
      setError(userMessage(e, couldNot("load the logs")));
      setLogText("");
    } finally {
      setLoading(false);
    }
  }, [levelRequest, search]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open || !autoRefresh) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 2_000);
    return () => window.clearInterval(id);
  }, [open, autoRefresh, refresh]);

  const [confirmingClear, setConfirmingClear] = useState(false);

  const handleClearLogs = useCallback(async () => {
    if (!window.cuepoint?.clearCuepointLogs) return;
    setConfirmingClear(false);
    setLoading(true);
    try {
      await window.cuepoint.clearCuepointLogs();
      await refresh();
    } catch (e) {
      reportUnexpected(e);
      setError(userMessage(e, couldNot("clear the logs")));
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const handleOpenLogsFolder = useCallback(async () => {
    if (!window.cuepoint?.getLogsDir || !window.cuepoint.showItemInFolder) return;
    try {
      const result = await window.cuepoint.getLogsDir();
      await window.cuepoint.showItemInFolder(result.logs_dir);
    } catch (e) {
      reportUnexpected(e);
      setError(userMessage(e, couldNot("open the logs folder")));
    }
  }, []);

  // The native Save dialog names the file; main makes the label safe (M264).
  const canSaveText = typeof window !== "undefined" && typeof window.cuepoint?.saveLogTextDialog === "function";
  const handleSaveAsText = useCallback(async () => {
    const save = window.cuepoint?.saveLogTextDialog;
    if (!save) return;
    try {
      const label = search.trim() || (level === "All" ? null : LEVEL_WORDS[level].toLowerCase());
      const result = await save({ text: logText, label });
      if (!result.canceled) toast?.push(`Log saved: ${displayPathNameFirst(result.filePath)}`, "success");
    } catch (e) {
      reportUnexpected(e);
      setError(userMessage(e, couldNot("save the log")));
    }
  }, [level, logText, search, toast]);

  // An empty log and a filter that matches nothing are different news.
  const emptyText = search || level !== "All" ? "No lines match" : "Nothing logged yet";

  const selectOptions = useMemo(
    () =>
      LEVEL_OPTIONS.map((v) => ({
        value: v,
        label: LEVEL_WORDS[v],
      })),
    [],
  );

  return (
    <>
    <Modal
      open={open}
      title="Log viewer"
      size="large"
      onClose={onClose}
      closeLabel="Close"
    >
      <div className="log-viewer-dialog">
        <div className="log-viewer-dialog__controls">
          <Select
            label="Level"
            options={selectOptions}
            value={level}
            onChange={(e) => setLevel(e.target.value as (typeof LEVEL_OPTIONS)[number])}
          />
          <SearchField
            thing="logs"
            className="log-viewer-dialog__search"
            value={search}
            onValueChange={setSearch}
          />
          <label className="log-viewer-dialog__auto cp-check">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
        </div>

        <div className="cp-button-row log-viewer-dialog__actions">
          {/* Auto-refresh reads the log every two seconds, so a manual Refresh beside it says the same thing twice. */}
          {autoRefresh ? null : (
            <Button variant="secondary" disabled={loading} loading={loading} onClick={() => void refresh()}>
              Refresh
            </Button>
          )}
          {canSaveText ? (
            <Button variant="secondary" disabled={loading} onClick={() => void handleSaveAsText()}>
              Save as text file…
            </Button>
          ) : null}
          <Button variant="secondary" disabled={loading} onClick={() => void handleOpenLogsFolder()}>
            {OPEN_LOG_FOLDER}
          </Button>
          {/* The one red button goes last, after a gap (C123). */}
          <Button
            className="log-viewer-dialog__clear"
            variant="danger"
            disabled={loading}
            onClick={() => setConfirmingClear(true)}
          >
            Clear logs…
          </Button>
        </div>

        {error ? <Notice kind="danger">{error}</Notice> : null}

        {loading && logText === "" ? (
          <Loading what="logs" />
        ) : (
          <>
            {logText === "" && !error ? <EmptyState compact headline={emptyText} className="log-viewer-dialog__empty" /> : null}
            {logText === "" ? null : <pre className="log-viewer-dialog__output">{logText}</pre>}
          </>
        )}
      </div>
    </Modal>
    <ConfirmDialog
      open={confirmingClear}
      title="Clear logs?"
      danger
      confirmLabel="Clear logs"
      onConfirm={() => void handleClearLogs()}
      onCancel={() => setConfirmingClear(false)}
    >
      Every line in the log is removed. This cannot be undone.
    </ConfirmDialog>
    </>
  );
}
