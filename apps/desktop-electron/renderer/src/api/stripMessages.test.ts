/** What the strip says about a full disk and the once-only notes (HARDEN-03, HARDEN-05, DEC-305). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeActiveJobs } from "./jobsStore";
import { announceLibraryChange } from "./libraryChanges";
import { userMessage } from "./userMessage";
import {
  DISK_FULL_HOLD_MS,
  NOTICE_HOLD_MS,
  getStripMessages,
  isDiskFull,
  noteDiskFull,
  showStripNotice,
} from "./stripMessages";

function engineError(code: string, status: number, message: string): Error {
  return Object.assign(new Error(message), { code, status, reportId: null });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a full disk", () => {
  it("is recognised by its code, from any request", () => {
    expect(isDiskFull(engineError("R002", 507, "Your disk is full."))).toBe(true);
    expect(isDiskFull(engineError("NOT_FOUND", 404, "Nope"))).toBe(false);
    expect(isDiskFull("R002")).toBe(false);
  });

  it("is noted when a failure is put into words", () => {
    userMessage(engineError("R002", 507, "Your disk is full. CuePoint can't save changes until there's space."));
    expect(getStripMessages().diskFull).toBe(true);
  });

  it("is not noted for another failure", () => {
    userMessage(engineError("BAD_REQUEST", 400, "bpm must be between 20 and 300"));
    expect(getStripMessages().diskFull).toBe(false);
  });

  it("is not cleared by a change the page only announces", () => {
    noteDiskFull();
    announceLibraryChange();
    expect(getStripMessages().diskFull).toBe(true);
  });

  it("clears when the engine's library counter moves, which only a write does", async () => {
    let library = 1;
    (window as unknown as { cuepoint: unknown }).cuepoint = {
      listJobs: async () => ({ jobs: [], active_count: 0, revisions: { library, waveforms: 1 } }),
    };
    const off = subscribeActiveJobs(() => undefined, 100);
    await vi.advanceTimersByTimeAsync(10);
    noteDiskFull();
    library = 2;
    await vi.advanceTimersByTimeAsync(300);
    expect(getStripMessages().diskFull).toBe(false);
    off();
  });

  it("clears after a while when nothing is saved", () => {
    noteDiskFull();
    vi.advanceTimersByTime(DISK_FULL_HOLD_MS - 1);
    expect(getStripMessages().diskFull).toBe(true);
    vi.advanceTimersByTime(2);
    expect(getStripMessages().diskFull).toBe(false);
  });
});

describe("the notes", () => {
  it("show one at a time, each for a while, never the same words twice", () => {
    showStripNotice("One");
    showStripNotice("Two");
    showStripNotice("Two");
    expect(getStripMessages().notice).toBe("One");
    vi.advanceTimersByTime(NOTICE_HOLD_MS);
    expect(getStripMessages().notice).toBe("Two");
    vi.advanceTimersByTime(NOTICE_HOLD_MS);
    expect(getStripMessages().notice).toBeNull();
  });
});
