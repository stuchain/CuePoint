import { useState } from "react";
import { Button, Modal, Select, useToast } from "../components";
import type { ExportFormat } from "../api/cuepointBridge.types";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { useMatchResults } from "../context/MatchResultsContext";
import { useExportResults } from "../hooks/useExportResults";
import type { TrackResult } from "../mocks/types";

interface ExportResultsModalProps {
  open: boolean;
  onClose: () => void;
  rows: TrackResult[];
  playlistName?: string;
}

export function ExportResultsModal({
  open,
  onClose,
  rows,
  playlistName = "cuepoint-export",
}: ExportResultsModalProps) {
  const { push } = useToast();
  const { jobId } = useMatchResults();
  const [format, setFormat] = useState<ExportFormat>("csv");
  const engineAvailable = hasEngineBridge();

  const { exporting, exportResults } = useExportResults({
    onSuccess: (filePath, count) => {
      push(`Exported ${count} tracks to ${filePath}`, "success");
      onClose();
    },
    onError: (message) => push(message, "warning"),
  });

  const handleExport = () => {
    if (!engineAvailable) {
      push(`Exported as ${format.toUpperCase()} (mock).`, "success");
      onClose();
      return;
    }
    void exportResults({ format, results: rows, jobId, playlistName });
  };

  return (
    <Modal
      open={open}
      title="Export results"
      onClose={onClose}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
      primaryAction={{
        label: exporting ? "Exporting…" : "Export",
        onClick: handleExport,
        loading: exporting,
      }}
    >
      <Select
        label="Format"
        value={format}
        onChange={(event) => setFormat(event.target.value as ExportFormat)}
        options={[
          { value: "csv", label: "CSV" },
          { value: "json", label: "JSON" },
          { value: "xlsx", label: "Excel (.xlsx)" },
        ]}
      />
      <p className="screen__muted">
        {rows.length} track{rows.length === 1 ? "" : "s"} selected
        {engineAvailable ? " · saves via engine" : " · mock in browser"}
      </p>
      {!rows.length && (
        <p className="screen__muted">Run a match job or load fixture results first.</p>
      )}
    </Modal>
  );
}

interface ExportResultsButtonProps {
  rows: TrackResult[];
  playlistName?: string;
  variant?: "primary" | "secondary";
  label?: string;
}

export function ExportResultsButton({
  rows,
  playlistName,
  variant = "secondary",
  label = "Export results…",
}: ExportResultsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} disabled={!rows.length}>
        {label}
      </Button>
      <ExportResultsModal
        open={open}
        onClose={() => setOpen(false)}
        rows={rows}
        playlistName={playlistName}
      />
    </>
  );
}
