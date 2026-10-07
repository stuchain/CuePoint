import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ENGINE_REQUEST_FAILED,
  EngineClient,
  EngineError,
  setEngineTraceHeaders,
} from "./engineClient";

/**
 * Errors keep their code (REPORT-04, DEC-126).
 *
 * Every reader that throws on a failed answer throws an `EngineError` that
 * carries the envelope's code, the HTTP status and the engine's `report_id`,
 * with `message` as it always was. A refusal read as a value stays a value.
 */

const client = () => new EngineClient(51236, "t0ken");

function engineAnswering(status: number, body: unknown, raw?: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(raw ?? JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
}

const envelope = (status: number, error: Record<string, unknown>) =>
  engineAnswering(status, { error });

async function thrown(call: Promise<unknown>): Promise<EngineError> {
  const error = await call.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(EngineError);
  return error as EngineError;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setEngineTraceHeaders(null);
});

describe("readJson", () => {
  it("throws an EngineError with the envelope's code, status, report id and words", async () => {
    envelope(500, { code: "LIBRARY_STORE_FAILED", message: "The library could not be read.", report_id: "abc123" });

    const error = await thrown(client().searchLibrary({ q: "x" }));

    expect(error.message).toBe("The library could not be read.");
    expect(error.status).toBe(500);
    expect(error.code).toBe("LIBRARY_STORE_FAILED");
    expect(error.reportId).toBe("abc123");
    expect(error.name).toBe("EngineError");
  });

  it("has a null report id when the engine sent none, as on a refusal", async () => {
    envelope(400, { code: "INVALID_REQUEST", message: "q is required" });

    const error = await thrown(client().searchLibrary({ q: "" }));

    expect(error).toMatchObject({ status: 400, code: "INVALID_REQUEST", reportId: null });
  });

  it("names ENGINE_REQUEST_FAILED when the body has no code", async () => {
    engineAnswering(502, { detail: "bad gateway" });

    const error = await thrown(client().searchLibrary({ q: "x" }));

    expect(error).toMatchObject({
      status: 502,
      code: ENGINE_REQUEST_FAILED,
      reportId: null,
      message: "Engine request failed (502)",
    });
  });

  it("still has a status when the body is not JSON", async () => {
    engineAnswering(500, null, "<html>oops</html>");

    const error = await thrown(client().searchLibrary({ q: "x" }));

    expect(error).toMatchObject({ status: 500, code: ENGINE_REQUEST_FAILED, reportId: null });
  });

  it("ignores a report id that is not a string", async () => {
    envelope(500, { code: "X", message: "m", report_id: 12 });

    expect((await thrown(client().searchLibrary({ q: "x" }))).reportId).toBeNull();
  });

  it("is not an EngineError when nothing answered", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));

    await expect(client().searchLibrary({ q: "x" })).rejects.not.toBeInstanceOf(EngineError);
  });

  it("leaves a successful answer alone", async () => {
    engineAnswering(200, { tracks: [] });

    await expect(client().searchLibrary({ q: "x" })).resolves.toEqual({ tracks: [] });
  });
});

describe("readRefusable", () => {
  it("throws an EngineError for a failure that is not an export refusal", async () => {
    envelope(500, { code: "EXPORT_FAILED", message: "boom", report_id: "r1" });

    const error = await thrown(client().startRekordboxExport({ destination_path: "/tmp/x.xml" }));

    expect(error).toMatchObject({ status: 500, code: "EXPORT_FAILED", reportId: "r1", message: "boom" });
  });

  it("still answers an export refusal as a value", async () => {
    envelope(409, { code: "LIBRARY_BUSY", message: "A job is running." });

    const answer = await client().startRekordboxExport({ destination_path: "/tmp/x.xml" });

    expect(JSON.stringify(answer)).toContain("LIBRARY_BUSY");
  });
});

describe("readDiscover", () => {
  it("throws an EngineError for a failure that is not a Discover refusal", async () => {
    envelope(500, { code: "DISCOVER_FAILED", message: "no", report_id: "d1" });

    const error = await thrown(client().getDiscoverOptions());

    expect(error).toMatchObject({ status: 500, code: "DISCOVER_FAILED", reportId: "d1", message: "no" });
  });

  it("throws an EngineError for an unreadable body", async () => {
    engineAnswering(503, null, "not json");

    expect(await thrown(client().getDiscoverOptions())).toMatchObject({
      status: 503,
      code: ENGINE_REQUEST_FAILED,
    });
  });
});

describe("readSetAnswer", () => {
  it("throws an EngineError for a failure that is not a Set refusal", async () => {
    envelope(500, { code: "SET_FAILED", message: "no", report_id: "s1" });

    const error = await thrown(client().getSetPlan({ set_id: 1 }));

    expect(error).toMatchObject({ status: 500, code: "SET_FAILED", reportId: "s1" });
  });

  it("throws an EngineError for an unreadable body", async () => {
    engineAnswering(500, null, "");

    expect(await thrown(client().getSetPlan({ set_id: 1 }))).toMatchObject({ status: 500 });
  });
});

describe("readWaveformAnswer", () => {
  it("throws an EngineError for a failure that is not a waveform refusal", async () => {
    envelope(500, { code: "WAVEFORM_FAILED", message: "no", report_id: "w1" });

    const error = await thrown(client().getWaveforms({ track_ids: [1], width: 10, marks: false }));

    expect(error).toMatchObject({ status: 500, code: "WAVEFORM_FAILED", reportId: "w1" });
  });
});

describe("the other readers", () => {
  it("artwork throws an EngineError", async () => {
    envelope(500, { code: "ARTWORK_FAILED", message: "no", report_id: "a1" });

    const error = await thrown(client().getTrackArtwork({ trackId: 1, size: "row" }));

    expect(error).toMatchObject({ status: 500, code: "ARTWORK_FAILED", reportId: "a1" });
  });

  it("a job's event stream throws an EngineError", async () => {
    envelope(404, { code: "JOB_NOT_FOUND", message: "No such job." });

    const error = await thrown(client().streamJobEvents("j", new AbortController().signal, () => {}));

    expect(error).toMatchObject({ status: 404, code: "JOB_NOT_FOUND", reportId: null });
  });
});

describe("trace headers", () => {
  const headersOf = (): Record<string, string> => {
    const fetchMock = vi.mocked(fetch);
    return fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
  };

  it("are sent when a provider is set, and the token still wins", async () => {
    engineAnswering(200, { tracks: [] });
    setEngineTraceHeaders(() => ({ "sentry-trace": "abc-def", baggage: "sentry-trace_id=abc", Authorization: "no" }));

    await client().searchLibrary({ q: "x" });

    expect(headersOf()).toMatchObject({
      "sentry-trace": "abc-def",
      baggage: "sentry-trace_id=abc",
      Authorization: "Bearer t0ken",
    });
  });

  it("are absent when none is set", async () => {
    engineAnswering(200, { tracks: [] });

    await client().searchLibrary({ q: "x" });

    expect(Object.keys(headersOf())).not.toContain("sentry-trace");
  });

  it("never fail a request when the provider throws", async () => {
    engineAnswering(200, { tracks: [] });
    setEngineTraceHeaders(() => {
      throw new Error("sdk gone");
    });

    await expect(client().searchLibrary({ q: "x" })).resolves.toEqual({ tracks: [] });
  });
});
