import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";
import { Notice } from "./Notice";
import { SearchField } from "./SearchField";
import { Select } from "./Select";
import { reportUnexpected } from "../reporting/reporting";
import "./LogViewerDialog.css";
import { userMessage } from "../api/userMessage";

const LEVEL_OPTIONS = ["All", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] as const;

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface LogViewerDialogProps {
  open: boolean;
  onClose: () => void;
}

export function LogViewerDialog({ open, onClose }: LogViewerDialogProps) {
  const [level, setLevel] = useState<(typeof LEVEL_OPTIONS)[number]>("All");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logText, setLogText] = useState<string>("Loading…");
  const [error, setError] = useState<string | null>(null);

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
      setError(userMessage(e, "Failed to load logs."));
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
      setError(userMessage(e, "Failed to clear logs."));
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
      setError(userMessage(e, "Failed to open logs folder."));
    }
  }, []);

  const handleExport = useCallback(() => {
    const filename = `cuepoint.log${search ? `-search-${search}` : ""}.txt`;
    downloadTextFile(filename, logText);
  }, [logText, search]);

  // An empty log and a filter that matches nothing are different news.
  const emptyText = search || level !== "All" ? "No lines match" : "Nothing logged yet";

  const selectOptions = useMemo(
    () =>
      LEVEL_OPTIONS.map((v) => ({
        value: v,
        label: v,
      })),
    [],
  );

  return (
    <>
    <Modal
      open={open}
      title="Log viewer"
      size="wide"
      onClose={onClose}
      secondaryAction={{ label: "Close", onClick: onClose }}
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
          <label className="log-viewer-dialog__auto">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
        </div>

        <div className="log-viewer-dialog__actions">
          <Button variant="secondary" disabled={loading} loading={loading} onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button variant="danger" disabled={loading} onClick={() => setConfirmingClear(true)}>
            Clear logs…
          </Button>
          <Button variant="secondary" disabled={loading} onClick={handleExport}>
            Export…
          </Button>
          <Button variant="secondary" disabled={loading} onClick={() => void handleOpenLogsFolder()}>
            Open logs folder
          </Button>
        </div>

        {error ? <Notice kind="problem">{error}</Notice> : null}

        <pre className="log-viewer-dialog__output">{logText === "" && !error && !loading ? emptyText : logText}</pre>
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
