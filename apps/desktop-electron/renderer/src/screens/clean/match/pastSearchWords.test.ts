import { describe, expect, it } from "vitest";

import type { MatchRun } from "../../../api/cuepointBridge.types";
import { DEFAULT_LIBRARY_QUERY } from "../../library/libraryQuery";
import { runOptionLabel, matchQuery, matchRules, matchScopeOptions, runSelection } from "./matchScope";
import { canResume, resultParts, statusOf, whatLine, whenLabel } from "./pastSearchWords";

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
    status: "done",
    finished_at: null,
    latest_job_id: "job-1",
    resume_job_id: null,
    ...overrides,
  };
}

const NOW = new Date("2026-10-12T15:00:00");

describe("when a run happened", () => {
  it("says today, yesterday, or the date", () => {
    expect(whenLabel("2026-10-12T13:42:00", NOW)).toBe("Today 13:42");
    expect(whenLabel("2026-10-11T22:10:00", NOW)).toBe("Yesterday 22:10");
    expect(whenLabel("2026-10-10T18:31:00", NOW)).toBe("10 Oct 18:31");
  });

  it("shows what is not a time as it came, and nothing for none", () => {
    expect(whenLabel("sometime", NOW)).toBe("sometime");
    expect(whenLabel(null, NOW)).toBe("");
  });
});

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
  it("is a rule on its root job id, beside what Show asks", () => {
    expect(matchRules("needs_review", { kind: "run", id: "job-1" }).rules).toEqual([
      { field: "match_state", operator: "is", value: "needs_review" },
      { field: "match_run", operator: "is", value: "job-1" },
    ]);
    expect(matchRules("needs_review", null).rules).toEqual([
      { field: "match_state", operator: "is", value: "needs_review" },
    ]);
  });

  it("holds every track of the run for Everything in this search", () => {
    expect(matchRules("everything", { kind: "run", id: "job-1" }).rules).toEqual([
      { field: "match_run", operator: "is", value: "job-1" },
    ]);
    expect(runSelection("job-1")).toEqual({
      query: { filters: { match: "all", rules: [{ field: "match_run", operator: "is", value: "job-1" }] } },
    });
  });

  it("offers Everything in this search only once a run is chosen", () => {
    expect(matchScopeOptions(false).map((option) => option.label)).toEqual([
      "Waiting for you",
      "Changed since you decided",
      "Accepted",
      "Rejected",
      "No match",
      "Not matched",
    ]);
    expect(matchScopeOptions(true).at(-1)?.label).toBe("Everything in this search");
  });

  it("scopes to a playlist by the scope cleanQuery takes, with no run rule (C22)", () => {
    const order = { sort: "artist", dir: "asc" } as const;
    const query = matchQuery("needs_review", { kind: "playlist", id: 12, name: "Peak time" }, order);
    expect(query).toMatchObject({ playlistId: 12, scope: null, collectionId: null });
    expect(query.filters).toEqual({
      match: "all",
      rules: [{ field: "match_state", operator: "is", value: "needs_review" }],
    });
    // A run, or nothing, stays on the whole library.
    expect(matchQuery("needs_review", { kind: "run", id: "job-1" }, order).playlistId).toBeNull();
    expect(matchQuery("needs_review", null, order)).toMatchObject({
      playlistId: DEFAULT_LIBRARY_QUERY.playlistId,
    });
  });

  it("names a run in From by when and what", () => {
    expect(runOptionLabel(run(), NOW)).toBe('Today 13:42 · Playlist "all"');
    expect(runOptionLabel(run({ label: null, planned: 24 }), NOW)).toBe("Today 13:42 · 24 tracks");
  });
});
