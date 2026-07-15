import { describe, expect, it } from "vitest";
import { idleProgress } from "../mocks/fixtures";
import { isTerminalJobState, normalizeProgress, progressFromJobStatus } from "./matchJobUtils";

describe("normalizeProgress", () => {
  it("returns idle progress when input is missing", () => {
    expect(normalizeProgress(undefined)).toEqual(idleProgress);
  });

  it("computes percentage from completed and total tracks", () => {
    const progress = normalizeProgress({
      completed_tracks: 2,
      total_tracks: 5,
    });
    expect(progress.percentage).toBe(40);
  });

  it("fills current_track defaults", () => {
    const progress = normalizeProgress({
      completed_tracks: 1,
      total_tracks: 2,
      current_track: { title: "Track A", artists: "" },
    });
    expect(progress.current_track).toEqual({ title: "Track A", artists: "" });
  });
});

describe("progressFromJobStatus", () => {
  it("maps failed jobs to failed progress", () => {
    const progress = progressFromJobStatus({
      id: "job-1",
      state: "failed",
      error: { code: "JOB_FAILED", message: "Boom" },
    });
    expect(progress.reliability_state).toBe("failed");
    expect(progress.status_message).toBe("Boom");
  });

  it("maps running job progress", () => {
    const progress = progressFromJobStatus({
      id: "job-1",
      state: "running",
      progress: {
        completed_tracks: 1,
        total_tracks: 3,
        matched_count: 1,
        unmatched_count: 0,
        status_message: "Working",
      },
    });
    expect(progress.reliability_state).toBe("running");
    expect(progress.percentage).toBeCloseTo(33.33, 1);
  });
});

describe("isTerminalJobState", () => {
  it("detects terminal states", () => {
    expect(isTerminalJobState("succeeded")).toBe(true);
    expect(isTerminalJobState("failed")).toBe(true);
    expect(isTerminalJobState("running")).toBe(false);
  });
});
