/**
 * The places that turn an answer into an Error must give it the fields `reportUnexpected`
 * reads (REPORT-06): a refusal, a failed job and a stopped job are not bugs (DEC-153).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import beatportHalfSource from "../screens/discover/BeatportHalf.tsx?raw";
import wantlistSource from "../screens/discover/WantlistView.tsx?raw";
import { finishedResult } from "../components/shell/ActivityOffer";
import { jobResult } from "../screens/library/jobResult";
import { fakeFacade } from "./fakeFacade.testFixture";
import { lastReportId, reportUnexpected, resetRendererReporting, setupRendererReporting } from "./reporting";

const finished = vi.hoisted(() => ({ value: { state: "failed" } as Record<string, unknown> }));
vi.mock("../screens/library/followJob", () => ({
  followJob: () => ({ finished: Promise.resolve(finished.value), stop: () => {} }),
}));

async function started() {
  const sdk = fakeFacade();
  await setupRendererReporting({
    sdk,
    bridge: { errorReporting: { get: async () => ({ enabled: true, configured: true }), set: async (enabled) => ({ enabled }) } },
  });
  return sdk;
}

const caught = (call: () => Promise<unknown>): Promise<unknown> => call().then(() => undefined, (e: unknown) => e);

afterEach(() => {
  resetRendererReporting();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("a refusal the Discover pages throw while collecting ids", () => {
  it("is thrown with refusalError, never as a plain Error", () => {
    for (const source of [beatportHalfSource, wantlistSource]) {
      expect(source).not.toContain("new Error(refusalText(");
      expect(source).toContain("refusalError(refusalText(answer.refusal)");
    }
  });
});

describe.each([
  ["WriteTagsDialog", jobResult],
  ["ActivityOffer", finishedResult],
])("a job %s waits for", (_name, wait) => {
  it("that fails on a cause the user owns is not reported", async () => {
    const sdk = await started();
    finished.value = { state: "failed", error: { code: "LIBRARY_NOT_IMPORTED", message: "x" } };
    const error = await caught(() => wait("job-1"));
    expect(error).toBeInstanceOf(Error);
    expect(reportUnexpected(error)).toBeNull();
    expect(sdk.exceptions).toEqual([]);
  });

  it("that fails and was reported by the engine is not reported again, and its id is the last report", async () => {
    const sdk = await started();
    const reportId = "c".repeat(32);
    finished.value = { state: "failed", error: { code: "TAG_WRITE_FAILED", message: "x", report_id: reportId } };
    const error = await caught(() => wait("job-2"));
    expect(reportUnexpected(error)).toBeNull();
    expect(sdk.exceptions).toEqual([]);
    expect(lastReportId()).toBe(reportId);
  });

  it("that fails in an unexpected way is reported once", async () => {
    const sdk = await started();
    finished.value = { state: "failed", error: { code: "JOB_FAILED", message: "boom" } };
    const error = await caught(() => wait("job-3"));
    expect(reportUnexpected(error)).not.toBeNull();
    expect(sdk.exceptions).toHaveLength(1);
  });
});

describe("a job the user stopped", () => {
  it("is not reported", async () => {
    const sdk = await started();
    window.cuepoint = { getJobResults: async () => ({ result: null }) } as never;
    finished.value = { state: "cancelled" };
    const error = await caught(() => jobResult("job-4"));
    expect((error as Error).message).toBe("Stopped before it had an answer.");
    expect(reportUnexpected(error)).toBeNull();
    expect(sdk.exceptions).toEqual([]);
  });
});
