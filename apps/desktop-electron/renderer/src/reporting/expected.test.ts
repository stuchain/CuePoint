import { afterEach, describe, expect, it } from "vitest";

import { fakeFacade } from "./fakeFacade.testFixture";
import { EXPECTED_JOB_ERROR_CODES, cancelledError, jobFailureError, refusalError } from "./expected";
import { lastReportId, reportUnexpected, resetRendererReporting, setupRendererReporting } from "./reporting";

async function started() {
  const sdk = fakeFacade();
  await setupRendererReporting({
    sdk,
    bridge: { errorReporting: { get: async () => ({ enabled: true, configured: true }), set: async (enabled) => ({ enabled }) } },
  });
  return sdk;
}

afterEach(() => resetRendererReporting());

describe("a refusal the page throws as an error", () => {
  it("is not reported", async () => {
    const sdk = await started();
    expect(reportUnexpected(refusalError("Beatport is busy.", "DISCOVER_BUSY"))).toBeNull();
    expect(sdk.exceptions).toEqual([]);
  });
});

describe("a failed job the page throws as an error", () => {
  it("is not reported when its code is one the user owns (DEC-153)", async () => {
    const sdk = await started();
    for (const code of ["BEATPORT_REJECTED", "LIBRARY_NOT_IMPORTED", "source_missing", "TAG_WRITE_PREVIEW_NOT_FOUND"]) {
      expect(reportUnexpected(jobFailureError(`failed ${code}`, { code, message: "x" }))).toBeNull();
    }
    expect(sdk.exceptions).toEqual([]);
  });

  it("is not reported again when the engine reported it, and its id becomes the last report", async () => {
    const sdk = await started();
    const reportId = "d".repeat(32);
    const error = jobFailureError("The tag write failed.", { code: "TAG_WRITE_FAILED", message: "x", report_id: reportId });
    expect(reportUnexpected(error)).toBeNull();
    expect(sdk.exceptions).toEqual([]);
    expect(lastReportId()).toBe(reportId);
  });

  it("is reported once when it is an ordinary failure with no report id", async () => {
    const sdk = await started();
    expect(reportUnexpected(jobFailureError("The tag write failed.", { code: "JOB_FAILED", message: "x" }))).not.toBeNull();
    expect(sdk.exceptions).toHaveLength(1);
  });
});

describe("a job the user stopped", () => {
  it("is not reported", async () => {
    const sdk = await started();
    expect(reportUnexpected(cancelledError("Stopped before it had an answer."))).toBeNull();
    expect(sdk.exceptions).toEqual([]);
  });
});

// The engine's list arrived with REPORT-03; a tree without it has nothing to compare with.
const engineFile = import.meta.glob<string>("../../../../../src/cuepoint/reporting/expected.py", {
  query: "?raw",
  import: "default",
  eager: true,
});
const expectedPy = Object.values(engineFile)[0];

describe("the expected job codes", () => {
  it.skipIf(expectedPy === undefined)("are the engine's, spelled the same", () => {
    const py = expectedPy!;
    const block = (name: string): string[] => {
      const start = py.indexOf(`${name}: frozenset[str] = frozenset(`);
      const end = py.indexOf("\n)\n", start);
      return [...py.slice(start, end).matchAll(/^\s+"([^"]+)",/gm)].map((m) => m[1]!);
    };
    const engine = [...block("EXPECTED_JOB_ERROR_CODES"), ...block("EXPECTED_ROUTE_ERROR_CODES")].sort();
    expect([...EXPECTED_JOB_ERROR_CODES].sort()).toEqual(engine);
  });
});
