import { useCallback, useEffect, useRef, useState } from "react";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { isTerminalJobState, progressFromJobStatus } from "../api/matchJobUtils";
import { idleProgress, sampleProgress } from "../mocks/fixtures";
import type { ProgressInfo } from "../mocks/types";
import { useMatchResults } from "../context/MatchResultsContext";

const POLL_INTERVAL_MS = 300;

export type FileSource = "none" | "mock" | "native";

interface UseMatchJobOptions {
  onComplete?: () => void;
  onError?: (message: string) => void;
}

export function useMatchJob({ onComplete, onError }: UseMatchJobOptions = {}) {
  const { setEngineResults } = useMatchResults();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo>(idleProgress);
  const pollTimerRef = useRef<number | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPollTimer(), [clearPollTimer]);

  const pollJob = useCallback(
    async (jobId: string) => {
      const bridge = window.cuepoint;
      if (!bridge) return;

      try {
        const status = await bridge.getJob(jobId);
        setProgress(progressFromJobStatus(status));

        if (!isTerminalJobState(status.state)) return;

        clearPollTimer();
        activeJobIdRef.current = null;
        setRunning(false);

        if (status.state === "failed") {
          onError?.(status.error?.message ?? "Match job failed");
          return;
        }

        const payload = await bridge.getJobResults(jobId);
        setEngineResults(payload.results, jobId);
        onComplete?.();
      } catch (error) {
        clearPollTimer();
        activeJobIdRef.current = null;
        setRunning(false);
        onError?.(error instanceof Error ? error.message : "Match job failed");
      }
    },
    [clearPollTimer, onComplete, onError, setEngineResults],
  );

  const startMockRun = useCallback(() => {
    setRunning(true);
    setProgress(sampleProgress);
    window.setTimeout(() => {
      setRunning(false);
      setProgress({
        ...sampleProgress,
        completed_tracks: sampleProgress.total_tracks,
        percentage: 100,
        reliability_state: "completed",
        status_message: "Complete",
      });
      onComplete?.();
    }, 2500);
  }, [onComplete]);

  const startMatch = useCallback(
    async (filePath: string, fileSource: FileSource, playlistName: string) => {
      if (running) return;

      if (!hasEngineBridge()) {
        if (!filePath) {
          onError?.("Select a Rekordbox XML file first.");
          return;
        }
        startMockRun();
        return;
      }

      const bridge = window.cuepoint!;
      const useRealJob =
        fileSource === "native" && filePath.trim().length > 0 && playlistName.trim().length > 0;

      setRunning(true);
      setProgress({
        ...idleProgress,
        reliability_state: "preflight",
        status_message: useRealJob ? "Starting match job…" : "Starting demo job…",
      });

      try {
        const started = await bridge.startMatchJob(
          useRealJob
            ? { xml_path: filePath, playlist_name: playlistName.trim() }
            : { demo: true },
        );
        activeJobIdRef.current = started.id;
        await pollJob(started.id);
        pollTimerRef.current = window.setInterval(() => {
          void pollJob(started.id);
        }, POLL_INTERVAL_MS);
      } catch (error) {
        setRunning(false);
        setProgress(idleProgress);
        onError?.(error instanceof Error ? error.message : "Failed to start match job");
      }
    },
    [onComplete, onError, pollJob, running, startMockRun],
  );

  return {
    running,
    progress,
    startMatch,
  };
}
