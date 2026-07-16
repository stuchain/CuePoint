import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Select } from "./Select";
import "./LogViewerDialog.css";

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

export interface LogViewerDialogProps {
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
      setError(e instanceof Error ? e.message : "Failed to load logs.");
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

  const handleClearLogs = useCallback(async () => {
    if (!window.cuepoint?.clearCuepointLogs) return;
    const ok = window.confirm("Clear logs now? This cannot be undone.");
    if (!ok) return;
    setLoading(true);
    try {
      await window.cuepoint.clearCuepointLogs();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear logs.");
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
      setError(e instanceof Error ? e.message : "Failed to open logs folder.");
    }
  }, []);

  const handleExport = useCallback(() => {
    const filename = `cuepoint.log${search ? `-search-${search}` : ""}.txt`;
    downloadTextFile(filename, logText);
  }, [logText, search]);

  const selectOptions = useMemo(
    () =>
      LEVEL_OPTIONS.map((v) => ({
        value: v,
        label: v,
      })),
    [],
  );

  return (
    <Modal
      open={open}
      title="Log Viewer"
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
          <label className="log-viewer-dialog__search">
            <span className="log-viewer-dialog__search-label">Search</span>
            <input
              className="log-viewer-dialog__search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs…"
            />
          </label>
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
          <Button variant="secondary" disabled={loading} onClick={() => void handleClearLogs()}>
            Clear logs
          </Button>
          <Button variant="secondary" disabled={loading} onClick={handleExport}>
            Export…
          </Button>
          <Button variant="secondary" disabled={loading} onClick={() => void handleOpenLogsFolder()}>
            Open logs folder
          </Button>
        </div>

        {error ? <p className="log-viewer-dialog__error">{error}</p> : null}

        <pre className="log-viewer-dialog__output">{logText}</pre>
      </div>
    </Modal>
  );
}

