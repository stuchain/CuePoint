import { idleProgress } from "../mocks/fixtures";
import type { ProgressInfo } from "../mocks/types";
import type { JobState, MatchJobStatus } from "./cuepointBridge.types";

export function normalizeProgress(raw: Partial<ProgressInfo> | undefined | null): ProgressInfo {
  if (!raw) return idleProgress;

  const completed = raw.completed_tracks ?? 0;
  const total = raw.total_tracks ?? 0;
  const percentage =
    raw.percentage ??
    (total > 0 ? (completed / total) * 100 : idleProgress.percentage);

  return {
    ...idleProgress,
    ...raw,
    completed_tracks: completed,
    total_tracks: total,
    matched_count: raw.matched_count ?? 0,
    unmatched_count: raw.unmatched_count ?? 0,
    elapsed_time: raw.elapsed_time ?? 0,
    eta_seconds: raw.eta_seconds ?? null,
    status_message: raw.status_message ?? null,
    reliability_state: raw.reliability_state ?? null,
    percentage,
    current_track: {
      title: raw.current_track?.title ?? "",
      artists: raw.current_track?.artists ?? "",
    },
  };
}

export function isTerminalJobState(state: JobState | string): boolean {
  return state === "succeeded" || state === "failed";
}

export function progressFromJobStatus(job: MatchJobStatus): ProgressInfo {
  if (job.state === "failed") {
    return {
      ...idleProgress,
      reliability_state: "failed",
      status_message: job.error?.message ?? "Job failed",
    };
  }
  if (job.state === "succeeded" && job.progress) {
    return normalizeProgress({
      ...job.progress,
      reliability_state: job.progress.reliability_state ?? "completed",
      status_message: job.progress.status_message ?? "Complete",
    });
  }
  if (job.progress) {
    return normalizeProgress({
      ...job.progress,
      reliability_state: job.progress.reliability_state ?? "running",
    });
  }
  if (job.state === "queued") {
    return {
      ...idleProgress,
      reliability_state: "preflight",
      status_message: "Queued…",
    };
  }
  return {
    ...idleProgress,
    reliability_state: "running",
    status_message: "Starting…",
  };
}
