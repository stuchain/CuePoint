import { describe, expect, it } from "vitest";

import type { MatchRun } from "../../../api/cuepointBridge.types";
import { runSelection } from "./matchScope";
import { canResume, resultParts, statusOf, stopLine, whatLine } from "./pastSearchWords";

function run(overrides: Partial<MatchRun> = {}): MatchRun {
  return {
    job_id: "job-1",
    created_at: "2026-10-12T13:42:00",
    label: 'Playlist "all"',
    rematch: false,
    selected: 179,
    excluded: 0,
    planned: 179,
    done: 179,
    found: 131,
    waiting: 42,
    not_found: 6,
    rejected: 0,
    disputed: 0,
    search_failed: 0,
    status: "done",
    finished_at: null,
    latest_job_id: "job-1",
    resume_job_id: null,
    stop_reason: null,
    ...overrides,
  };
}

describe("what was matched", () => {
  it("is the label, else how many tracks", () => {
    expect(whatLine(run())).toBe('Playlist "all"');
    expect(whatLine(run({ label: null, planned: 2140 }))).toBe("2,140 tracks");
    expect(whatLine(run({ label: "  ", planned: 1 }))).toBe("1 track");
  });
});

describe("the results line", () => {
  it("counts what was found, waits, and is missing, as the tracks are now", () => {
    expect(resultParts(run()).map((part) => part.text)).toEqual([
      "131 found",
      "42 waiting for you",
      "6 not found",
    ]);
  });

  it("says how many a stopped run never reached", () => {
    const parts = resultParts(
      run({ planned: 2140, done: 976, found: 880, waiting: 96, not_found: 0, status: "stopped" }),
    );
    expect(parts.map((part) => part.text)).toEqual(["880 found", "96 waiting for you", "1,164 not reached"]);
  });

  it("leaves out zeros, and says so when there is nothing", () => {
    expect(resultParts(run({ waiting: 0, not_found: 0, found: 20 })).map((part) => part.text)).toEqual([
      "20 found",
    ]);
    expect(
      resultParts(run({ found: 0, waiting: 0, not_found: 0, done: 179, planned: 179 })).map((part) => part.text),
    ).toEqual(["Nothing found yet"]);
  });

  it("tones each part, so colour is never the only cue", () => {
    expect(resultParts(run()).map((part) => part.tone)).toEqual(["found", "waiting", "missing"]);
  });
});

describe("status", () => {
  it("is Done, Running or where it stopped", () => {
    expect(statusOf(run())).toEqual({ label: "Done", tone: "done" });
    expect(statusOf(run({ status: "running" }))).toEqual({ label: "Running", tone: "running" });
    expect(statusOf(run({ status: "stopped", done: 1040 }))).toEqual({
      label: "Stopped at 1,040",
      tone: "stopped",
    });
  });

  it("can be resumed only when stopped and the engine names the job", () => {
    expect(canResume(run({ status: "stopped", resume_job_id: "job-2" }))).toBe(true);
    expect(canResume(run({ status: "stopped", resume_job_id: null }))).toBe(false);
    expect(canResume(run({ status: "done", resume_job_id: "job-2" }))).toBe(false);
  });
});

describe("a run as a scope", () => {
  it("is a rule on its root job id: every track of the run, and the resumes that finished it", () => {
    expect(runSelection("job-1")).toEqual({
      query: { filters: { match: "all", rules: [{ field: "match_run", operator: "is", value: "job-1" }] } },
    });
  });
});

describe("why a run stopped", () => {
  it("says so in words when Beatport stopped it", () => {
    expect(stopLine(run({ status: "stopped", stop_reason: "Beatport did not answer" }))).toBe(
      "Stopped: Beatport did not answer.",
    );
  });

  it("says nothing for a run the person stopped, or one that is not stopped", () => {
    expect(stopLine(run({ status: "stopped", stop_reason: null }))).toBeNull();
    expect(stopLine(run({ status: "done", stop_reason: "Beatport did not answer" }))).toBeNull();
  });

  it("still offers Resume to a run Beatport stopped", () => {
    expect(
      canResume(run({ status: "stopped", stop_reason: "Beatport did not answer", resume_job_id: "j" })),
    ).toBe(true);
  });
});
