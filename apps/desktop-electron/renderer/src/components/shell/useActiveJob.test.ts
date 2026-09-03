import { describe, expect, it } from "vitest";

import type { EngineJobSummary } from "../../api/cuepointBridge.types";
import { jobLabel, jobPercent } from "./useActiveJob";

/**
 * The status strip is shared by every kind of background job (DEC-026), and
 * DEC-033 gave it a second one. Progress needed nothing: an import reports the
 * same `completed_tracks` / `total_tracks` shape a match does. The label did —
 * it said "Matching" unconditionally, so a running import told the user
 * CuePoint was matching their tracks, which is a different and destructive
 * sounding operation.
 */
function job(overrides: Partial<EngineJobSummary> = {}): EngineJobSummary {
  return {
    id: "job-1",
    type: "match",
    state: "running",
    created_at: "2026-09-03T10:00:00Z",
    updated_at: "2026-09-03T10:00:00Z",
    progress: { completed_tracks: 3, total_tracks: 10 },
    ...overrides,
  };
}

describe("jobLabel", () => {
  it("names a match run", () => {
    expect(jobLabel(job())).toBe("Matching 3/10");
  });

  it("names an import run", () => {
    expect(jobLabel(job({ type: "library_import" }))).toBe("Importing 3/10");
  });

  it("says queued before a job starts, whatever its type", () => {
    expect(jobLabel(job({ state: "queued" }))).toBe("Queued 3/10");
    expect(jobLabel(job({ type: "library_import", state: "queued" }))).toBe(
      "Queued 3/10",
    );
  });

  it("falls back to a neutral verb for a type it does not know", () => {
    // Not "Matching": a job this build has not heard of is not necessarily a
    // match, and guessing wrong tells the user something untrue.
    expect(jobLabel(job({ type: "waveform_analysis" }))).toBe("Working 3/10");
  });

  it("omits the count when the total is not known yet", () => {
    expect(jobLabel(job({ progress: { completed_tracks: 0, total_tracks: 0 } }))).toBe(
      "Matching",
    );
    expect(
      jobLabel(job({ type: "library_import", progress: undefined })),
    ).toBe("Importing");
  });

  it("is empty with no job", () => {
    expect(jobLabel(null)).toBe("");
  });
});

describe("jobPercent", () => {
  it("reads an import's percentage the same way as a match's", () => {
    const progress = { completed_tracks: 1940, total_tracks: 3880 };
    expect(jobPercent(job({ progress }))).toBe(50);
    expect(jobPercent(job({ type: "library_import", progress }))).toBe(50);
  });

  it("prefers the percentage the engine sent", () => {
    expect(
      jobPercent(
        job({
          type: "library_import",
          progress: { completed_tracks: 1, total_tracks: 3880, percentage: 42 },
        }),
      ),
    ).toBe(42);
  });

  it("is null while the total is unknown", () => {
    expect(
      jobPercent(job({ type: "library_import", progress: { total_tracks: 0 } })),
    ).toBeNull();
  });

  it("clamps a nonsense percentage into range", () => {
    expect(
      jobPercent(job({ progress: { completed_tracks: 5000, total_tracks: 3880 } })),
    ).toBe(100);
  });
});
