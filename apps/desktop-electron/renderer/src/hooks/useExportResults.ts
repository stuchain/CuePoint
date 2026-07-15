import { useCallback, useState } from "react";
import type { ExportFormat } from "../api/cuepointBridge.types";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import type { TrackResult } from "../mocks/types";

interface UseExportResultsOptions {
  onSuccess?: (filePath: string, count: number) => void;
  onError?: (message: string) => void;
}

export function useExportResults({ onSuccess, onError }: UseExportResultsOptions = {}) {
  const [exporting, setExporting] = useState(false);

  const exportResults = useCallback(
    async ({
      format,
      results,
      jobId,
      playlistName = "cuepoint-export",
    }: {
      format: ExportFormat;
      results: TrackResult[];
      jobId?: string | null;
      playlistName?: string;
    }) => {
      if (!results.length) {
        onError?.("No results to export.");
        return;
      }

      if (!hasEngineBridge() || !window.cuepoint?.exportResults) {
        onError?.("Export requires the Electron app with engine connected.");
        return;
      }

      const saveDialog = window.cuepoint.saveExportFileDialog;
      if (!saveDialog) {
        onError?.("Save dialog unavailable.");
        return;
      }

      const picked = await saveDialog({
        defaultPath: `${playlistName}.${format === "xlsx" ? "xlsx" : format}`,
        format,
      });
      if (picked.canceled) return;

      setExporting(true);
      try {
        const payload = jobId
          ? {
              format,
              file_path: picked.filePath,
              job_id: jobId,
              playlist_name: playlistName,
              overwrite: true,
            }
          : {
              format,
              file_path: picked.filePath,
              results,
              playlist_name: playlistName,
              overwrite: true,
            };
        const response = await window.cuepoint.exportResults(payload);
        onSuccess?.(response.file_path, response.count);
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Export failed");
      } finally {
        setExporting(false);
      }
    },
    [onError, onSuccess],
  );

  return { exporting, exportResults };
}
