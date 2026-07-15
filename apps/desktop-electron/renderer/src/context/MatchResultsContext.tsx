import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { TrackResult } from "../mocks/types";

export type ResultsSource = "fixtures" | "engine";
export type ResultsMode = "single" | "batch";

interface MatchResultsContextValue {
  mode: ResultsMode;
  results: TrackResult[];
  batchResults: Record<string, TrackResult[]>;
  activePlaylist: string | null;
  source: ResultsSource;
  jobId: string | null;
  setEngineResults: (results: TrackResult[], jobId: string) => void;
  setEngineBatchResults: (batchResults: Record<string, TrackResult[]>, jobId: string) => void;
  clearEngineResults: () => void;
  setActivePlaylist: (playlistName: string) => void;
  updateTrackResult: (
    playlistName: string | null,
    playlistIndex: number,
    updater: (row: TrackResult) => TrackResult,
  ) => void;
}

const MatchResultsContext = createContext<MatchResultsContextValue | null>(null);

export function MatchResultsProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<TrackResult[]>([]);
  const [batchResults, setBatchResults] = useState<Record<string, TrackResult[]>>({});
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [source, setSource] = useState<ResultsSource>("fixtures");
  const [mode, setMode] = useState<ResultsMode>("single");

  const setEngineResults = useCallback((nextResults: TrackResult[], nextJobId: string) => {
    setResults(nextResults);
    setBatchResults({});
    setActivePlaylist(null);
    setJobId(nextJobId);
    setSource("engine");
    setMode("single");
  }, []);

  const setEngineBatchResults = useCallback(
    (nextBatchResults: Record<string, TrackResult[]>, nextJobId: string) => {
      const playlistNames = Object.keys(nextBatchResults);
      setResults([]);
      setBatchResults(nextBatchResults);
      setActivePlaylist(playlistNames[0] ?? null);
      setJobId(nextJobId);
      setSource("engine");
      setMode("batch");
    },
    [],
  );

  const clearEngineResults = useCallback(() => {
    setResults([]);
    setBatchResults({});
    setActivePlaylist(null);
    setJobId(null);
    setSource("fixtures");
    setMode("single");
  }, []);

  const updateTrackResult = useCallback(
    (
      playlistName: string | null,
      playlistIndex: number,
      updater: (row: TrackResult) => TrackResult,
    ) => {
      if (mode === "batch" && playlistName) {
        setBatchResults((prev) => {
          const rows = prev[playlistName];
          if (!rows) return prev;
          return {
            ...prev,
            [playlistName]: rows.map((row) =>
              row.playlist_index === playlistIndex ? updater(row) : row,
            ),
          };
        });
        return;
      }

      setResults((prev) =>
        prev.map((row) => (row.playlist_index === playlistIndex ? updater(row) : row)),
      );
    },
    [mode],
  );

  const value = useMemo(
    () => ({
      mode,
      results,
      batchResults,
      activePlaylist,
      source,
      jobId,
      setEngineResults,
      setEngineBatchResults,
      clearEngineResults,
      setActivePlaylist,
      updateTrackResult,
    }),
    [
      mode,
      results,
      batchResults,
      activePlaylist,
      source,
      jobId,
      setEngineResults,
      setEngineBatchResults,
      clearEngineResults,
      updateTrackResult,
    ],
  );

  return <MatchResultsContext.Provider value={value}>{children}</MatchResultsContext.Provider>;
}

export function useMatchResults(): MatchResultsContextValue {
  const ctx = useContext(MatchResultsContext);
  if (!ctx) {
    throw new Error("useMatchResults must be used within MatchResultsProvider");
  }
  return ctx;
}
