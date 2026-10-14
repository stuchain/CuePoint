/** The toast that says a playlist's match ended, from another page (C22). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MatchRun } from "../../../api/cuepointBridge.types";
import { announceRunEnd, matchDoneLine } from "./matchDone";

const RUN: MatchRun = {
  job_id: "job-1",
  created_at: "2026-10-14T10:00:00Z",
  label: "hJ",
  rematch: false,
  selected: 24,
  excluded: 0,
  planned: 24,
  done: 24,
  found: 15,
  waiting: 9,
  not_found: 0,
  rejected: 0,
  disputed: 0,
  status: "done",
  finished_at: "2026-10-14T10:01:00Z",
  latest_job_id: "job-1",
  resume_job_id: null,
};

describe("matchDoneLine", () => {
  it("says what was confirmed and what is left to check", () => {
    expect(matchDoneLine("hJ", RUN)).toBe("hJ matched · 15 confirmed · 9 to check");
  });
  it("leaves out a count that is none", () => {
    expect(matchDoneLine("hJ", { found: 24, waiting: 0 })).toBe("hJ matched · 24 confirmed");
    expect(matchDoneLine("hJ", { found: 0, waiting: 3 })).toBe("hJ matched · 3 to check");
    expect(matchDoneLine("hJ", { found: 0, waiting: 0 })).toBe("hJ matched · nothing found");
  });
});

describe("announceRunEnd", () => {
  let getJob: ReturnType<typeof vi.fn>;
  let getMatchJobs: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    getJob = vi.fn().mockResolvedValue({ id: "job-1", state: "succeeded" });
    getMatchJobs = vi.fn().mockResolvedValue({ jobs: [RUN], total: 1 });
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getJob, getMatchJobs };
  });
  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  });

  it("pushes the line with a Review button that opens the run, when the person is elsewhere", async () => {
    const push = vi.fn();
    const onReview = vi.fn();
    announceRunEnd({ jobId: "job-1", label: "hJ", away: () => true, push, onReview });
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const [message, variant, action] = push.mock.calls[0]!;
    expect(message).toBe("hJ matched · 15 confirmed · 9 to check");
    expect(variant).toBe("success");
    expect(action.label).toBe("Review 9");
    action.onClick();
    expect(onReview).toHaveBeenCalledWith(RUN);
  });

  it("offers no Review when nothing waits", async () => {
    getMatchJobs.mockResolvedValue({ jobs: [{ ...RUN, waiting: 0 }], total: 1 });
    const push = vi.fn();
    announceRunEnd({ jobId: "job-1", label: "hJ", away: () => true, push, onReview: vi.fn() });
    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    expect(push.mock.calls[0]![2]).toBeUndefined();
  });

  it("says nothing when the person is looking at the rows", async () => {
    const push = vi.fn();
    announceRunEnd({ jobId: "job-1", label: "hJ", away: () => false, push, onReview: vi.fn() });
    await vi.waitFor(() => expect(getJob).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(push).not.toHaveBeenCalled();
    expect(getMatchJobs).not.toHaveBeenCalled();
  });

  it.each(["failed", "cancelled"])(
    "leaves a %s run to the job follower, so it is said once and not twice",
    async (state) => {
      getJob.mockResolvedValue({ id: "job-1", state, error: { message: "Beatport did not answer." } });
      const push = vi.fn();
      announceRunEnd({ jobId: "job-1", label: "hJ", away: () => true, push, onReview: vi.fn() });
      await vi.waitFor(() => expect(getJob).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(push).not.toHaveBeenCalled();
    },
  );
});
