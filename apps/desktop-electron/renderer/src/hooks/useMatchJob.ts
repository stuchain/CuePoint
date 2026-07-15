import { useCallback, useEffect, useRef, useState } from "react";
import type { MatchJobStatus } from "../api/cuepointBridge.types";
import { hasEngineBridge } from "../api/cuepointBridge.types";
import { isTerminalJobState, progressFromJobStatus } from "../api/matchJobUtils";
import { idleProgress, sampleProgress } from "../mocks/fixtures";
import type { ProgressInfo } from "../mocks/types";
import { useMatchResults } from "../context/MatchResultsContext";

const POLL_INTERVAL_MS = 300;

export type FileSource = "none" | "mock" | "native";

export type MatchInputSource = "collection" | "playlist_file";

interface StartMatchOptions {
  demoBatch?: boolean;
  playlistNames?: string[];
  inputSource?: MatchInputSource;
}

interface UseMatchJobOptions {
  onComplete?: () => void;
  onCancelled?: () => void;
  onError?: (message: string) => void;
}

export function useMatchJob({ onComplete, onCancelled, onError }: UseMatchJobOptions = {}) {
  const { setEngineResults, setEngineBatchResults } = useMatchResults();
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo>(idleProgress);
  const pollTimerRef = useRef<number | null>(null);
  const unsubscribeEventsRef = useRef<(() => void) | null>(null);
  const mockTimerRef = useRef<number | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current != null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearEventSubscription = useCallback(() => {
    if (unsubscribeEventsRef.current) {
      unsubscribeEventsRef.current();
      unsubscribeEventsRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearPollTimer();
      clearEventSubscription();
      if (mockTimerRef.current != null) {
        window.clearTimeout(mockTimerRef.current);
      }
    },
    [clearEventSubscription, clearPollTimer],
  );

  const finishJob = useCallback(
    async (status: MatchJobStatus, jobId: string) => {
      clearPollTimer();
      clearEventSubscription();
      activeJobIdRef.current = null;
      setRunning(false);
      setCancelling(false);
      setProgress(progressFromJobStatus(status));

      if (status.state === "cancelled") {
        onCancelled?.();
        return;
      }

      if (status.state === "failed") {
        onError?.(status.error?.message ?? "Match job failed");
        return;
      }

      const bridge = window.cuepoint;
      if (!bridge?.getJobResults) return;
      const payload = await bridge.getJobResults(jobId);
      if (payload.batch_results && Object.keys(payload.batch_results).length > 0) {
        setEngineBatchResults(payload.batch_results, jobId);
      } else {
        setEngineResults(payload.results, jobId);
      }
      onComplete?.();
    },
    [
      clearEventSubscription,
      clearPollTimer,
      onCancelled,
      onComplete,
      onError,
      setEngineBatchResults,
      setEngineResults,
    ],
  );

  const handleJobEvent = useCallback(
    (jobId: string, event: MatchJobStatus & { type?: string }) => {
      if (event.type === "error") {
        onError?.(typeof event.error?.message === "string" ? event.error.message : "Job stream failed");
        return;
      }
      setProgress(progressFromJobStatus(event));
      if (isTerminalJobState(event.state)) {
        void finishJob(event, jobId);
      }
    },
    [finishJob, onError],
  );

  const pollJob = useCallback(
    async (jobId: string) => {
      const bridge = window.cuepoint;
      if (!bridge) return;

      try {
        const status = await bridge.getJob(jobId);
        handleJobEvent(jobId, status);
      } catch (error) {
        clearPollTimer();
        clearEventSubscription();
        activeJobIdRef.current = null;
        setRunning(false);
        setCancelling(false);
        onError?.(error instanceof Error ? error.message : "Match job failed");
      }
    },
    [clearEventSubscription, clearPollTimer, handleJobEvent, onError],
  );

  const subscribeToJob = useCallback(
    (jobId: string) => {
      const bridge = window.cuepoint;
      if (bridge?.subscribeJobEvents) {
        clearEventSubscription();
        unsubscribeEventsRef.current = bridge.subscribeJobEvents(jobId, (event) => {
          handleJobEvent(jobId, event);
        });
        return;
      }

      clearPollTimer();
      pollTimerRef.current = window.setInterval(() => {
        void pollJob(jobId);
      }, POLL_INTERVAL_MS);
    },
    [clearEventSubscription, clearPollTimer, handleJobEvent, pollJob],
  );

  const startMockRun = useCallback(() => {
    setRunning(true);
    setProgress(sampleProgress);
    mockTimerRef.current = window.setTimeout(() => {
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
    async (
      filePath: string,
      fileSource: FileSource,
      playlistName: string,
      options?: StartMatchOptions,
    ) => {
      if (running) return;

      const inputSource = options?.inputSource ?? "collection";

      if (!hasEngineBridge()) {
        if (!filePath) {
          onError?.(
            inputSource === "playlist_file"
              ? "Select an M3U playlist file first."
              : "Select a Rekordbox XML file first.",
          );
          return;
        }
        startMockRun();
        return;
      }

      const bridge = window.cuepoint!;
      const playlistNames = options?.playlistNames?.filter((name) => name.trim().length > 0) ?? [];
      const useRealM3u =
        inputSource === "playlist_file" && fileSource === "native" && filePath.trim().length > 0;
      const useRealBatch =
        inputSource === "collection" &&
        fileSource === "native" &&
        filePath.trim().length > 0 &&
        playlistNames.length > 0;
      const useRealJob =
        inputSource === "collection" &&
        fileSource === "native" &&
        filePath.trim().length > 0 &&
        playlistName.trim().length > 0 &&
        !useRealBatch;
      const demoBatch = Boolean(options?.demoBatch);

      setRunning(true);
      setCancelling(false);
      setProgress({
        ...idleProgress,
        reliability_state: "preflight",
        status_message: useRealM3u
          ? "Starting M3U match job…"
          : useRealBatch
            ? `Starting batch job (${playlistNames.length} playlists)…`
            : useRealJob
              ? "Starting match job…"
              : demoBatch
                ? "Starting batch demo job…"
                : "Starting demo job…",
      });

      try {
        const started = await bridge.startMatchJob(
          useRealM3u
            ? { m3u_path: filePath.trim() }
            : useRealBatch
              ? { xml_path: filePath, playlist_names: playlistNames }
              : useRealJob
                ? { xml_path: filePath, playlist_name: playlistName.trim() }
                : demoBatch
                  ? { demo: true, demo_batch: true }
                  : { demo: true },
        );
        activeJobIdRef.current = started.id;
        await pollJob(started.id);
        subscribeToJob(started.id);
      } catch (error) {
        setRunning(false);
        setCancelling(false);
        setProgress(idleProgress);
        onError?.(error instanceof Error ? error.message : "Failed to start match job");
      }
    },
    [onError, pollJob, running, startMockRun, subscribeToJob],
  );

  const cancelMatch = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    if (!running || !jobId) return;

    if (!window.cuepoint?.cancelMatchJob) {
      if (mockTimerRef.current != null) {
        window.clearTimeout(mockTimerRef.current);
        mockTimerRef.current = null;
      }
      setRunning(false);
      setProgress({
        ...idleProgress,
        reliability_state: "failed",
        status_message: "Cancelled",
      });
      onCancelled?.();
      return;
    }

    setCancelling(true);
    try {
      await window.cuepoint.cancelMatchJob(jobId);
    } catch (error) {
      setCancelling(false);
      onError?.(error instanceof Error ? error.message : "Failed to cancel job");
    }
  }, [onCancelled, onError, running]);

  return {
    running,
    cancelling,
    progress,
    startMatch,
    cancelMatch,
  };
}
