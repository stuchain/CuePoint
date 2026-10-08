import { describe, expect, it } from "vitest";

import type { EngineJobSummary } from "../../api/cuepointBridge.types";
import {
  JOB_EXPLAINERS,
  aboutDuration,
  jobExplainer,
  jobLabel,
  jobPercent,
  jobStopLabel,
  jobTitle,
} from "./useActiveJob";

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
    type: "clean_match",
    state: "running",
    created_at: "2026-09-03T10:00:00Z",
    updated_at: "2026-09-03T10:00:00Z",
    progress: { completed_tracks: 3, total_tracks: 10 },
    ...overrides,
  };
}

describe("jobLabel", () => {
  it("names a match run", () => {
    expect(jobLabel(job())).toBe("Matching on Beatport · 3 of 10");
  });

  it("names an import run", () => {
    expect(jobLabel(job({ type: "library_import" }))).toBe("Importing · 3 of 10");
  });

  it("tells the two halves of a refresh apart", () => {
    // One reads and one deletes (DEC-003). A single verb for both would leave
    // the only place the app reports background work unable to say whether the
    // irreversible half had started.
    expect(jobLabel(job({ type: "library_refresh_preview" }))).toBe("Checking your Rekordbox export for changes · 3 of 10");
    expect(jobLabel(job({ type: "library_refresh_apply" }))).toBe("Refreshing · 3 of 10");
  });

  it("names a file check apart from a refresh preview", () => {
    // CLEAN-07: a check follows every import and refresh unasked, so the strip
    // shows it to people who did not start it, and "Checking" alone already
    // means the preview.
    expect(jobLabel(job({ type: "file_check" }))).toBe("Checking files · 3 of 10");
  });

  it("names a duplicate scan", () => {
    // CLEAN-08: a scan follows every import, refresh and match job unasked.
    expect(jobLabel(job({ type: "duplicate_scan" }))).toBe("Finding duplicates · 3 of 10");
  });

  it("names an artwork scan", () => {
    // CLEAN-09: a scan follows every whole-library file check unasked.
    expect(jobLabel(job({ type: "artwork_scan" }))).toBe("Reading artwork · 3 of 10");
  });

  it("names a tag write apart from its preview and its restore", () => {
    // CLEAN-10: the one job that writes audio files must not read as the
    // preview that only reads them, nor as the restore that undoes it.
    expect(jobLabel(job({ type: "tag_write_preview" }))).toBe("Reading tags · 3 of 10");
    expect(jobLabel(job({ type: "tag_write" }))).toBe("Writing tags · 3 of 10");
    expect(jobLabel(job({ type: "tag_restore" }))).toBe("Restoring tags · 3 of 10");
  });

  it("names the Rekordbox export apart from the other exports (EXPORT-05)", () => {
    expect(jobLabel(job({ type: "rekordbox_export" }))).toBe(
      "Exporting to Rekordbox · 3 of 10",
    );
  });

  it("says what the unasked-for name index rebuild is doing (DISCOVER-03)", () => {
    // It starts on its own after an upgrade, so "Working" would be a job the
    // user never started and cannot identify.
    expect(jobLabel(job({ type: "credit_index" }))).toBe(
      "Getting artist and label pages ready · 3 of 10",
    );
  });

  it("says what the unasked-for read of an older library's cues is doing (WAVE-04)", () => {
    expect(jobLabel(job({ type: "marks_backfill" }))).toBe("Reading your cue points · 3 of 10");
  });

  it("names Discover's three Beatport jobs (DISCOVER-09)", () => {
    expect(jobLabel(job({ type: "discovery", progress: undefined }))).toBe(
      "Discovering on Beatport",
    );
    expect(jobLabel(job({ type: "beatport_playlist", progress: undefined }))).toBe(
      "Making a playlist on Beatport",
    );
    expect(jobLabel(job({ type: "beatport_resolve" }))).toBe(
      "Linking tracks to Beatport · 3 of 10",
    );
  });

  it("says a discovery's or a push's stage, since a count means nothing without it", () => {
    // DISCOVER-05's stages, as the engine words them in its progress.
    const stage = (type: string, status_message: string | null) =>
      jobLabel(
        job({ type, progress: { completed_tracks: 3, total_tracks: 10, status_message } }),
      );
    expect(stage("discovery", "Reading charts")).toBe("Reading charts · 3 of 10");
    expect(stage("discovery", "Resolving labels")).toBe("Resolving labels · 3 of 10");
    expect(stage("beatport_playlist", "Adding tracks to the Beatport playlist")).toBe(
      "Adding tracks to the Beatport playlist · 3 of 10",
    );
    // No stage yet, or a blank one: the verb stands in.
    expect(stage("discovery", null)).toBe("Discovering on Beatport · 3 of 10");
    expect(stage("discovery", "  ")).toBe("Discovering on Beatport · 3 of 10");
  });

  it("keeps every other job's verb whatever its progress says", () => {
    // A match's status message is the matcher's own chatter, not a stage.
    expect(
      jobLabel(
        job({
          progress: { completed_tracks: 3, total_tracks: 10, status_message: "Querying Beatport" },
        }),
      ),
    ).toBe("Matching on Beatport · 3 of 10");
  });

  it("says queued for a staged job before it starts", () => {
    expect(
      jobLabel(
        job({
          type: "discovery",
          state: "queued",
          progress: { completed_tracks: 0, total_tracks: 0, status_message: "Reading charts" },
        }),
      ),
    ).toBe("Waiting to start");
  });

  it("has no verb for inKey's retired file-based match (CLEAN-14)", () => {
    // No build since CLEAN-14 starts one, and the strip shows only active
    // jobs, which a restart closes out.
    expect(jobLabel(job({ type: "match" }))).toBe("Working on it · 3 of 10");
  });

  it("says queued before a job starts, whatever its type", () => {
    expect(jobLabel(job({ state: "queued" }))).toBe("Waiting to start · 3 of 10");
    expect(jobLabel(job({ type: "library_import", state: "queued" }))).toBe(
      "Waiting to start · 3 of 10",
    );
  });

  it("falls back to a neutral verb for a type it does not know", () => {
    // Not "Matching": a job this build has not heard of is not necessarily a
    // match, and guessing wrong tells the user something untrue.
    expect(jobLabel(job({ type: "a_job_from_a_later_build" }))).toBe("Working on it · 3 of 10");
  });

  it("omits the count when the total is not known yet", () => {
    expect(jobLabel(job({ progress: { completed_tracks: 0, total_tracks: 0 } }))).toBe(
      "Matching on Beatport",
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

/**
 * The waveform analysis (WAVE-03) starts on its own after every file check and
 * can run for hours, so the strip counts the library in words, gives its rate
 * in the title, and calls its Stop what it is: a Pause, kept across a restart.
 */
describe("the waveform analysis on the strip", () => {
  const analysis = (progress: EngineJobSummary["progress"]) =>
    job({ type: "waveform_analysis", progress });

  it("counts the library in words", () => {
    expect(jobLabel(analysis({ completed_tracks: 1234, total_tracks: 50000 }))).toBe(
      "Analyzing waveforms · 1,234 of 50,000",
    );
  });

  it("is named before its first count", () => {
    expect(jobLabel(analysis(undefined))).toBe("Analyzing waveforms");
  });

  it("leaves every other job's count as it was", () => {
    expect(jobLabel(job({ progress: { completed_tracks: 1234, total_tracks: 5000 } }))).toBe(
      "Matching on Beatport · 1,234 of 5,000",
    );
  });

  it("gives the rate and the time left in its title", () => {
    // 48,766 to go at 8,127.67 an hour is six hours.
    const title = jobTitle(
      analysis({ completed_tracks: 1234, total_tracks: 50000, eta_seconds: 6 * 3600 }),
    );
    expect(title).toBe(
      `${JOB_EXPLAINERS.waveform_analysis} About 8,128 an hour · about 6 hours left`,
    );
  });

  it("has only its explainer until there is a rate", () => {
    const reason = JOB_EXPLAINERS.waveform_analysis;
    expect(jobTitle(analysis({ completed_tracks: 3, total_tracks: 10 }))).toBe(reason);
    expect(jobTitle(analysis({ completed_tracks: 10, total_tracks: 10, eta_seconds: 5 }))).toBe(
      reason,
    );
    // A rate belongs to the waveform analysis alone.
    expect(
      jobTitle(job({ progress: { completed_tracks: 1, total_tracks: 2, eta_seconds: 60 } })),
    ).toBe(JOB_EXPLAINERS.clean_match);
  });

  it("says Pause, and every other job Stop", () => {
    expect(jobStopLabel(analysis(undefined))).toBe("Pause");
    expect(jobStopLabel(job())).toBe("Stop");
    expect(jobStopLabel(null)).toBe("Stop");
  });
});

describe("aboutDuration", () => {
  it.each([
    [20, "under a minute"],
    [60, "about 1 minute"],
    [45 * 60, "about 45 minutes"],
    [90 * 60, "about 2 hours"],
    [3600, "about 1 hour"],
    [26 * 3600, "about 26 hours"],
  ])("reads %s seconds as %s", (seconds, words) => {
    expect(aboutDuration(seconds)).toBe(words);
  });
});

describe("updating tracks (STR-3)", () => {
  it("says how many tracks when the total is known", () => {
    expect(jobLabel(job({ type: "library_batch" }))).toBe("Updating 10 tracks");
    expect(
      jobLabel(job({ type: "library_batch", progress: { completed_tracks: 1, total_tracks: 4000 } })),
    ).toBe("Updating 4,000 tracks");
    expect(jobLabel(job({ type: "library_batch", progress: undefined }))).toBe("Updating tracks");
  });
});

describe("counts (STR-3)", () => {
  it("are written '120 of 4,000' for every job", () => {
    expect(
      jobLabel(job({ progress: { completed_tracks: 120, total_tracks: 4000 } })),
    ).toBe("Matching on Beatport · 120 of 4,000");
  });
});

describe("what each kind of work is for (STR-3)", () => {
  const KNOWN = [
    "library_import",
    "library_refresh_preview",
    "library_refresh_apply",
    "library_batch",
    "file_check",
    "duplicate_scan",
    "artwork_scan",
    "clean_match",
    "tag_write_preview",
    "tag_write",
    "tag_restore",
    "rekordbox_export",
    "credit_index",
    "marks_backfill",
    "discovery",
    "beatport_playlist",
    "beatport_resolve",
    "waveform_analysis",
  ];

  it.each(KNOWN)("has an explainer for %s", (type) => {
    const reason = JOB_EXPLAINERS[type];
    expect(reason).toBeTruthy();
    // One sentence, and no internal word.
    expect(reason).not.toMatch(/\b(engine|jobs?)\b/i);
    expect(jobExplainer(type)).toBe(reason);
  });

  it("is what jobTitle returns", () => {
    expect(jobTitle(job({ type: "library_import" }))).toBe(JOB_EXPLAINERS.library_import);
  });

  it("tells the user they can keep working, for the waveform drawing", () => {
    expect(JOB_EXPLAINERS.waveform_analysis).toBe(
      "CuePoint is drawing each track's waveform. You can keep working; it pauses itself for imports.",
    );
  });

  it("has a plain fallback for a type it does not know", () => {
    expect(jobExplainer("a_job_from_a_later_build")).toBe(
      "CuePoint is working in the background. You can keep working.",
    );
    expect(jobTitle(job({ type: "a_job_from_a_later_build" }))).toBe(
      "CuePoint is working in the background. You can keep working.",
    );
    expect(jobTitle(null)).toBeUndefined();
  });
});
