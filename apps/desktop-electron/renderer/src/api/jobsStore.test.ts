import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EngineJobSummary, JobStatus } from "./cuepointBridge.types";
import {
  onJobFinished,
  onRevisionsChanged,
  pollActiveJobsNow,
  resetJobsStoreForTests,
  subscribeActiveJobs,
  subscribeJobEvents,
} from "./jobsStore";

function job(id: string, type = "library_import"): EngineJobSummary {
  return {
    id,
    type,
    state: "running",
    created_at: "2026-09-03T10:00:00Z",
    updated_at: "2026-09-03T10:00:00Z",
  };
}

interface Answer {
  jobs: EngineJobSummary[];
  active_count?: number;
  revisions?: { library: number; waveforms: number; discover?: number };
}

function install(answer: () => Promise<Answer> | Answer) {
  const listJobs = vi.fn(async () => {
    const next = await answer();
    return { active_count: next.jobs.length, ...next };
  });
  (window as unknown as { cuepoint?: unknown }).cuepoint = { listJobs };
  return listJobs;
}

// Lets a poll's promise chain settle without moving the timers.
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  resetJobsStoreForTests();
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.useRealTimers();
});

describe("subscribeActiveJobs", () => {
  it("asks once per tick however many are listening", async () => {
    const listJobs = install(() => ({ jobs: [] }));
    subscribeActiveJobs(() => {}, 1000);
    subscribeActiveJobs(() => {}, 1000);
    subscribeActiveJobs(() => {}, 1000);
    await settle();
    expect(listJobs).toHaveBeenCalledTimes(1);
    expect(listJobs).toHaveBeenCalledWith({ state: "active", limit: 5 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(listJobs).toHaveBeenCalledTimes(2);
  });

  it("stops asking when the last listener leaves", async () => {
    const listJobs = install(() => ({ jobs: [] }));
    const a = subscribeActiveJobs(() => {}, 1000);
    const b = subscribeActiveJobs(() => {}, 1000);
    await settle();
    a();
    await vi.advanceTimersByTimeAsync(1000);
    expect(listJobs).toHaveBeenCalledTimes(2);
    b();
    await vi.advanceTimersByTimeAsync(5000);
    expect(listJobs).toHaveBeenCalledTimes(2);
  });

  it("runs at the quickest interval asked for, and relaxes when that listener leaves", async () => {
    const listJobs = install(() => ({ jobs: [] }));
    subscribeActiveJobs(() => {}, 4000);
    await settle();
    const quick = subscribeActiveJobs(() => {}, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(listJobs).toHaveBeenCalledTimes(3);

    quick();
    listJobs.mockClear();
    await vi.advanceTimersByTimeAsync(3000);
    expect(listJobs).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(listJobs).toHaveBeenCalledTimes(1);
  });

  it("does not start a second poll while one is still out", async () => {
    let release: (() => void) | undefined;
    const listJobs = install(
      () =>
        new Promise<Answer>((resolve) => {
          release = () => resolve({ jobs: [] });
        }),
    );
    subscribeActiveJobs(() => {}, 1000);
    await vi.advanceTimersByTimeAsync(3500);
    expect(listJobs).toHaveBeenCalledTimes(1);

    release?.();
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(listJobs).toHaveBeenCalledTimes(2);
  });

  it("gives a late listener the current answer at once", async () => {
    install(() => ({ jobs: [job("a")] }));
    subscribeActiveJobs(() => {}, 1000);
    await settle();

    const late = vi.fn();
    subscribeActiveJobs(late, 1000);
    expect(late).toHaveBeenCalledTimes(1);
    expect(late.mock.calls[0]![0]).toMatchObject({ loaded: true, failed: false, activeCount: 1 });
  });

  it("asks again for a late listener when the answer it has is old, and hands it only the new one", async () => {
    let jobs = [job("a")];
    const listJobs = install(() => ({ jobs }));
    subscribeActiveJobs(() => {}, 2000);
    await settle();
    await vi.advanceTimersByTimeAsync(1500);
    jobs = [job("a"), job("chain", "file_check")];

    const late = vi.fn();
    subscribeActiveJobs(late, 2000);
    expect(late).not.toHaveBeenCalled();
    await settle();
    expect(listJobs).toHaveBeenCalledTimes(2);
    expect(late).toHaveBeenCalledTimes(1);
    expect(late.mock.calls[0]![0].jobs.map((j: EngineJobSummary) => j.id)).toEqual(["a", "chain"]);
  });

  it("does not let a poll that never answers stop the others for good", async () => {
    let calls = 0;
    const listJobs = install(() => {
      calls += 1;
      return calls === 1 ? new Promise<Answer>(() => {}) : { jobs: [job("a")] };
    });
    const seen = vi.fn();
    subscribeActiveJobs(seen, 1000);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(listJobs).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(listJobs.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ activeCount: 1 }));
  });

  it("reports a failed poll as failed, not as empty", async () => {
    install(() => {
      throw new Error("down");
    });
    const seen = vi.fn();
    subscribeActiveJobs(seen, 1000);
    await settle();
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ jobs: [], loaded: true, failed: true }));
  });
});

describe("pollActiveJobsNow", () => {
  it("shows a job just started without waiting for the tick", async () => {
    let jobs: EngineJobSummary[] = [];
    install(() => ({ jobs }));
    const seen: string[][] = [];
    subscribeActiveJobs((next) => seen.push(next.jobs.map((entry) => entry.id)), 2000);
    await settle();

    jobs = [job("batch")];
    pollActiveJobsNow();
    await settle();
    expect(seen.at(-1)).toEqual(["batch"]);
  });

  it("asks again after a poll that went out before the job started", async () => {
    let jobs: EngineJobSummary[] = [];
    let answerFirst: () => void = () => {};
    const listJobs = install(() => {
      if (listJobs.mock.calls.length > 1) return { jobs };
      const before = jobs;
      return new Promise<Answer>((resolve) => (answerFirst = () => resolve({ jobs: before })));
    });
    const seen: string[][] = [];
    subscribeActiveJobs((next) => seen.push(next.jobs.map((entry) => entry.id)), 2000);

    jobs = [job("batch")];
    pollActiveJobsNow();
    await settle();
    expect(listJobs).toHaveBeenCalledTimes(1);
    answerFirst();
    await settle();
    expect(listJobs).toHaveBeenCalledTimes(2);
    expect(seen).toEqual([[], ["batch"]]);
  });

  it("asks nothing while nobody is listening", async () => {
    const listJobs = install(() => ({ jobs: [] }));
    pollActiveJobsNow();
    await settle();
    expect(listJobs).not.toHaveBeenCalled();
  });
});

describe("subscribeJobEvents", () => {
  function fakeBridge() {
    const close = vi.fn();
    let emit: (event: JobStatus) => void = () => {};
    const subscribe = vi.fn((_id: string, onEvent: (event: JobStatus) => void) => {
      emit = onEvent;
      return close;
    });
    return { bridge: { subscribeJobEvents: subscribe }, subscribe, close, emit: (e: JobStatus) => emit(e) };
  }

  it("opens one stream for a job and closes it when the last listener leaves", () => {
    const { bridge, subscribe, close, emit } = fakeBridge();
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = subscribeJobEvents("a", first, bridge);
    const offSecond = subscribeJobEvents("a", second, bridge);
    expect(subscribe).toHaveBeenCalledTimes(1);

    emit({ id: "a", state: "running" });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    offFirst();
    expect(close).not.toHaveBeenCalled();
    offSecond();
    expect(close).toHaveBeenCalledTimes(1);

    subscribeJobEvents("a", first, bridge);
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it("opens a new stream for a newcomer once the old one has ended with an error frame", () => {
    const emits: Array<(event: JobStatus) => void> = [];
    const open = vi.fn((_id: string, onEvent: (event: JobStatus) => void) => {
      emits.push(onEvent);
      return () => {};
    });
    const bridge = { subscribeJobEvents: open };
    subscribeJobEvents("a", () => {}, bridge);
    // The engine's stream ran past its limit: an error frame with no state.
    emits[0]!({ id: "a", type: "error" } as unknown as JobStatus);

    const late = vi.fn();
    subscribeJobEvents("a", late, bridge);
    expect(open).toHaveBeenCalledTimes(2);
    emits[1]!({ id: "a", state: "running" });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it("keeps jobs and bridges apart", () => {
    const one = fakeBridge();
    const two = fakeBridge();
    subscribeJobEvents("a", () => {}, one.bridge);
    subscribeJobEvents("b", () => {}, one.bridge);
    subscribeJobEvents("a", () => {}, two.bridge);
    expect(one.subscribe).toHaveBeenCalledTimes(2);
    expect(two.subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("onJobFinished", () => {
  it("fires once when a job the poll saw is gone from a later poll", async () => {
    let jobs = [job("a")];
    install(() => ({ jobs }));
    const finished = vi.fn();
    onJobFinished(finished);
    subscribeActiveJobs(() => {}, 1000);
    await settle();
    expect(finished).not.toHaveBeenCalled();

    jobs = [];
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(finished).toHaveBeenCalledWith({ id: "a", type: "library_import" });
  });

  it("says nothing on a failed poll", async () => {
    let fail = false;
    let jobs = [job("a")];
    install(() => {
      if (fail) throw new Error("down");
      return { jobs };
    });
    const finished = vi.fn();
    onJobFinished(finished);
    subscribeActiveJobs(() => {}, 1000);
    await settle();

    fail = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(finished).not.toHaveBeenCalled();

    // Still not known to have ended once the engine answers again with it listed.
    fail = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(finished).not.toHaveBeenCalled();
    jobs = [];
    await vi.advanceTimersByTimeAsync(1000);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it("does not take a job hidden by the limit for a finished one", async () => {
    let answer: Answer = { jobs: [job("a")] };
    install(() => answer);
    const finished = vi.fn();
    onJobFinished(finished);
    subscribeActiveJobs(() => {}, 1000);
    await settle();

    answer = { jobs: [job("b"), job("c")], active_count: 7 };
    await vi.advanceTimersByTimeAsync(1000);
    expect(finished).not.toHaveBeenCalled();

    answer = { jobs: [job("b"), job("c")], active_count: 2 };
    await vi.advanceTimersByTimeAsync(1000);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(finished).toHaveBeenCalledWith({ id: "a", type: "library_import" });
  });

  it("fires from a stream that reports an end, and only once with the poll", async () => {
    let jobs = [job("a")];
    install(() => ({ jobs }));
    let emit: (event: JobStatus) => void = () => {};
    const bridge = {
      subscribeJobEvents: (_id: string, onEvent: (event: JobStatus) => void) => {
        emit = onEvent;
        return () => {};
      },
    };
    const finished = vi.fn();
    onJobFinished(finished);
    subscribeActiveJobs(() => {}, 1000);
    await settle();
    subscribeJobEvents("a", () => {}, bridge);

    // The engine's frames carry `type: "status"`, the frame's kind, never the job's.
    emit({ id: "a", type: "status", state: "running" });
    expect(finished).not.toHaveBeenCalled();
    emit({ id: "a", type: "status", state: "succeeded" });
    expect(finished).toHaveBeenCalledTimes(1);
    expect(finished).toHaveBeenCalledWith({ id: "a", type: "library_import" });

    // The poll still lists it for a moment, then drops it: still once.
    await vi.advanceTimersByTimeAsync(1000);
    jobs = [];
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(finished).toHaveBeenCalledTimes(1);
  });
});

describe("onRevisionsChanged", () => {
  it("treats the first value as a baseline and names what changed after", async () => {
    let revisions: { library: number; waveforms: number } | undefined = { library: 1, waveforms: 1 };
    install(() => ({ jobs: [], revisions }));
    const changed = vi.fn();
    onRevisionsChanged(changed);
    subscribeActiveJobs(() => {}, 1000);
    await settle();
    expect(changed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).not.toHaveBeenCalled();

    revisions = { library: 2, waveforms: 1 };
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(["library"]);

    revisions = { library: 2, waveforms: 5 };
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).toHaveBeenLastCalledWith(["waveforms"]);

    revisions = undefined;
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("names discover when only Discover's counter moved", async () => {
    let revisions: { library: number; waveforms: number; discover?: number } = {
      library: 1,
      waveforms: 1,
      discover: 1,
    };
    install(() => ({ jobs: [], revisions }));
    const changed = vi.fn();
    onRevisionsChanged(changed);
    subscribeActiveJobs(() => {}, 1000);
    await settle();

    revisions = { library: 1, waveforms: 1, discover: 2 };
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith(["discover"]);
  });
});

describe("resetJobsStoreForTests", () => {
  it("stops polling, drops listeners and closes streams", async () => {
    const listJobs = install(() => ({ jobs: [job("a")] }));
    const finished = vi.fn();
    onJobFinished(finished);
    subscribeActiveJobs(() => {}, 1000);
    await settle();
    const close = vi.fn();
    subscribeJobEvents("a", () => {}, { subscribeJobEvents: () => close });

    resetJobsStoreForTests();
    expect(close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(listJobs).toHaveBeenCalledTimes(1);

    // A fresh start knows nothing of the job it saw before.
    const again = vi.fn();
    subscribeActiveJobs(again, 1000);
    expect(again).not.toHaveBeenCalled();
    expect(finished).not.toHaveBeenCalled();
  });
});
