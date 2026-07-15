import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { TrackResult } from "../mocks/types";

export type ResultsSource = "fixtures" | "engine";

interface MatchResultsContextValue {
  results: TrackResult[];
  source: ResultsSource;
  jobId: string | null;
  setEngineResults: (results: TrackResult[], jobId: string) => void;
  clearEngineResults: () => void;
}

const MatchResultsContext = createContext<MatchResultsContextValue | null>(null);

export function MatchResultsProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<TrackResult[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [source, setSource] = useState<ResultsSource>("fixtures");

  const setEngineResults = useCallback((nextResults: TrackResult[], nextJobId: string) => {
    setResults(nextResults);
    setJobId(nextJobId);
    setSource("engine");
  }, []);

  const clearEngineResults = useCallback(() => {
    setResults([]);
    setJobId(null);
    setSource("fixtures");
  }, []);

  const value = useMemo(
    () => ({
      results,
      source,
      jobId,
      setEngineResults,
      clearEngineResults,
    }),
    [results, source, jobId, setEngineResults, clearEngineResults],
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
