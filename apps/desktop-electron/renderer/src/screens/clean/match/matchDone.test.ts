/** The toast that says a playlist's match ended, from another page (C22). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MatchRun } from "../../../api/cuepointBridge.types";
import {
  announceRunEnd,
  matchDoneLine,
  nothingFound,
  nothingFoundLine,
  nothingFoundTarget,
} from "./matchDone";

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
  search_failed: 0,
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

describe("nothingFound", () => {
  it("is what a run that found nothing at all found instead: failed searches and searches that ran", () => {
    expect(nothingFound({ ...RUN, found: 0, waiting: 0, not_found: 24, search_failed: 0 })).toEqual({
      failed: 0,
      notFound: 24,
    });
    expect(nothingFound({ ...RUN, found: 0, waiting: 0, not_found: 0, search_failed: 24 })).toEqual({
      failed: 24,
      notFound: 0,
    });
  });
  it("is null when anything was found or waits, or nothing was searched", () => {
    expect(nothingFound(RUN)).toBeNull();
    expect(nothingFound({ ...RUN, found: 0, waiting: 1, not_found: 23 })).toBeNull();
    expect(nothingFound({ ...RUN, found: 1, waiting: 0, not_found: 23 })).toBeNull();
    expect(nothingFound({ ...RUN, found: 0, waiting: 0, not_found: 0, search_failed: 0 })).toBeNull();
  });
  it("words them, and names the chip to open on", () => {
    expect(nothingFoundLine("hJ", { failed: 24, notFound: 0 })).toBe("hJ: 24 searches failed");
    expect(nothingFoundLine("hJ", { failed: 1, notFound: 0 })).toBe("hJ: 1 search failed");
    expect(nothingFoundLine("hJ", { failed: 0, notFound: 24 })).toBe("hJ: no Beatport match for 24 tracks");
    expect(nothingFoundTarget({ failed: 3, notFound: 5 })).toEqual({ filter: "search_failed", count: 3 });
    expect(nothingFoundTarget({ failed: 0, notFound: 5 })).toEqual({ filter: "not_found", count: 5 });
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

  it("says failed searches as failed, not as nothing on Beatport, in the toast", async () => {
    const failed = { ...RUN, found: 0, waiting: 0, not_found: 0, search_failed: 24 };
    getMatchJobs.mockResolvedValue({ jobs: [failed], total: 1 });
    const push = vi.fn();
    announceRunEnd({ jobId: "job-1", label: "hJ", away: () => true, push, onReview: vi.fn() });
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push.mock.calls[0]![0]).toBe("hJ: 24 searches failed");
    expect(push.mock.calls[0]![2].label).toBe("See the 24");
  });

  it("leaves the toast out when the red note is on screen to say the same", async () => {
    const nothing = { ...RUN, found: 0, waiting: 0, not_found: 24 };
    getMatchJobs.mockResolvedValue({ jobs: [nothing], total: 1 });
    const push = vi.fn();
    const onNothing = vi.fn();
    announceRunEnd({
      jobId: "job-1",
      label: "hJ",
      away: () => true,
      push,
      onReview: vi.fn(),
      onNothing,
      noteVisible: () => true,
    });
    await vi.waitFor(() => expect(onNothing).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(push).not.toHaveBeenCalled();
  });

  it("lands on the review, and says nothing, when the person is on Clean", async () => {
    const push = vi.fn();
    const onLand = vi.fn();
    announceRunEnd({ jobId: "job-1", label: "hJ", away: () => false, push, onReview: vi.fn(), onLand });
    await vi.waitFor(() => expect(onLand).toHaveBeenCalledWith(RUN));
    expect(push).not.toHaveBeenCalled();
  });

  it("does not land on a run that found nothing: the red note says so, with a way to see them", async () => {
    const nothing = { ...RUN, found: 0, waiting: 0, not_found: 24 };
    getMatchJobs.mockResolvedValue({ jobs: [nothing], total: 1 });
    const push = vi.fn();
    const onLand = vi.fn();
    const onNothing = vi.fn();
    announceRunEnd({ jobId: "job-1", label: "hJ", away: () => false, push, onReview: vi.fn(), onLand, onNothing });
    await vi.waitFor(() => expect(onNothing).toHaveBeenCalledWith(nothing, { failed: 0, notFound: 24 }));
    expect(onLand).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("says a run that found nothing in a toast with See them, from another page, and the red note too", async () => {
    const nothing = { ...RUN, found: 0, waiting: 0, not_found: 24 };
    getMatchJobs.mockResolvedValue({ jobs: [nothing], total: 1 });
    const push = vi.fn();
    const onReview = vi.fn();
    const onNothing = vi.fn();
    announceRunEnd({ jobId: "job-1", label: "hJ", away: () => true, push, onReview, onNothing });
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const [message, variant, action] = push.mock.calls[0]!;
    expect(message).toBe("hJ: no Beatport match for 24 tracks");
    expect(variant).toBe("warning");
    expect(action.label).toBe("See the 24");
    action.onClick();
    expect(onReview).toHaveBeenCalledWith(nothing);
    expect(onNothing).toHaveBeenCalledWith(nothing, { failed: 0, notFound: 24 });
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
