import { useCallback, useEffect, useState } from "react";
import type { HistoryFileEntry, HistoryLoadResponse } from "../api/cuepointBridge.types";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { mockPastHistoryFiles } from "../mocks/fixtures";

interface UsePastSearchesOptions {
  onError?: (message: string) => void;
}

export function usePastSearches({ onError }: UsePastSearchesOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<HistoryFileEntry[]>([]);
  const [directory, setDirectory] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<HistoryLoadResponse | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const engineAvailable = hasEngineBridge();

  const refreshRecent = useCallback(async () => {
    if (!engineAvailable) {
      setFiles(mockPastHistoryFiles);
      setDirectory("CuePoint_Output (mock)");
      return;
    }

    setLoading(true);
    try {
      const payload = await window.cuepoint!.getHistoryRecent({ limit: 50 });
      setFiles(payload.files);
      setDirectory(payload.directory);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [engineAvailable, onError]);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  const loadCsv = useCallback(
    async (csvPath: string) => {
      setSelectedPath(csvPath);
      if (!engineAvailable) {
        const mock = mockPastHistoryFiles.find((entry) => entry.file_path === csvPath);
        if (!mock?.preview) {
          onError?.("Mock preview unavailable for this file.");
          return null;
        }
        const payload: HistoryLoadResponse = {
          file_path: csvPath,
          file_name: mock.file_name,
          modified_at: mock.modified_at,
          row_count: mock.preview.length,
          matched_count: mock.preview.filter((row) => row.matched).length,
          unmatched_count: mock.preview.filter((row) => !row.matched).length,
          review_count: mock.preview.filter((row) => !row.matched || (row.match_score ?? 100) < 70).length,
          results: mock.preview,
          meta: mock.playlist_name
            ? { playlist_name: mock.playlist_name, xml_path: mock.xml_path, source: "collection" }
            : null,
          rerun: mock.rerun,
          related_files: mock.related_files,
        };
        setLoaded(payload);
        return payload;
      }

      setLoading(true);
      try {
        const payload = await window.cuepoint!.loadHistoryCsv(csvPath);
        setLoaded(payload);
        return payload;
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Failed to load CSV");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [engineAvailable, onError],
  );

  const browseCsv = useCallback(async () => {
    if (!window.cuepoint?.openCsvFileDialog) {
      onError?.("CSV browse requires Electron.");
      return null;
    }
    const result = await window.cuepoint.openCsvFileDialog();
    if (result.canceled) return null;
    return loadCsv(result.filePath);
  }, [loadCsv, onError]);

  return {
    engineAvailable,
    loading,
    files,
    directory,
    loaded,
    selectedPath,
    refreshRecent,
    loadCsv,
    browseCsv,
  };
}
