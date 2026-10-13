import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  callsBetween,
  inFlight,
  resetEngineCallTiming,
  routeOf,
  setEngineCallSink,
  timedFetch,
} from "./engineCallTiming";
import { EngineClient } from "./engineClient";

function stubFetch(delayMs: number, status = 200) {
  const fn = vi.fn(async () => {
    await new Promise((r) => setTimeout(r, delayMs));
    return new Response("{}", { status });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("timedFetch", () => {
  const sink = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
    resetEngineCallTiming();
    sink.mockReset();
    setEngineCallSink(sink);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function call(url: string, init?: RequestInit, delay = 0) {
    stubFetch(delay);
    const pending = timedFetch(url, init);
    await vi.advanceTimersByTimeAsync(delay);
    return pending;
  }

  it("logs a call over the threshold with route, status and in-flight count", async () => {
    await call("http://127.0.0.1:5123/api/v1/clean/health", undefined, 1400);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith("slow GET /api/v1/clean/health 1.4 s", { status: "200", inFlight: "0" });
  });

  it("stays quiet under the threshold but keeps the call in the ring", async () => {
    await call("http://127.0.0.1:5123/api/v1/library/summary", { method: "post" }, 200);
    expect(sink).not.toHaveBeenCalled();
    const [only] = callsBetween(0, Date.now() + 1);
    expect(only).toMatchObject({ method: "POST", route: "/api/v1/library/summary", status: 200 });
  });

  it("drops the query and the host and replaces ids", async () => {
    expect(routeOf("http://127.0.0.1:5123/api/v1/jobs/12345/events?token=abc")).toBe("/api/v1/jobs/:id/events");
    expect(routeOf("http://h/api/v1/tracks/3f2a9c1e-77aa-4b1c-9d00-0a1b2c3d4e5f/art?q=Secret")).toBe("/api/v1/tracks/:id/art");
    expect(routeOf("http://h/api/v1/library/playlists")).toBe("/api/v1/library/playlists");
    await call("http://127.0.0.1:5123/api/v1/library/search?q=Secret%20Song", undefined, 1500);
    expect(JSON.stringify(sink.mock.calls)).not.toMatch(/Secret|5123|127\.0/);
  });

  it("never lets the Authorization header or a token reach the sink", async () => {
    await call(
      "http://127.0.0.1:5123/api/v1/jobs/abc12345?access_token=tok-SECRET",
      { headers: { Authorization: "Bearer tok-SECRET" } },
      2000,
    );
    expect(sink).toHaveBeenCalled();
    expect(JSON.stringify(sink.mock.calls)).not.toMatch(/tok-SECRET|Bearer|Authorization/);
  });

  it("never logs or counts /events and /health", async () => {
    await call("http://h/api/v1/jobs/9/events", undefined, 5000);
    await call("http://h/health", undefined, 5000);
    expect(sink).not.toHaveBeenCalled();
    expect(callsBetween(0, Date.now() + 1)).toEqual([]);
  });

  it("counts calls in flight up and down, including a thrown fetch", async () => {
    stubFetch(100);
    const a = timedFetch("http://h/api/v1/a");
    const b = timedFetch("http://h/api/v1/b");
    expect(inFlight()).toBe(2);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([a, b]);
    expect(inFlight()).toBe(0);

    vi.stubGlobal("fetch", vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 1200));
      throw new TypeError("fetch failed");
    }));
    const failing = timedFetch("http://h/api/v1/c").catch((e: unknown) => e);
    expect(inFlight()).toBe(1);
    await vi.advanceTimersByTimeAsync(1200);
    expect(await failing).toBeInstanceOf(TypeError);
    expect(inFlight()).toBe(0);
    expect(sink).toHaveBeenCalledWith("slow GET /api/v1/c 1.2 s", { status: "failed", inFlight: "0" });
  });

  it("logs nothing without a sink and survives a sink that throws", async () => {
    setEngineCallSink(null);
    await call("http://h/api/v1/x", undefined, 1500);
    setEngineCallSink(() => {
      throw new Error("log broke");
    });
    await expect(call("http://h/api/v1/y", undefined, 1500)).resolves.toBeInstanceOf(Response);
  });

  it("times every engine client call (the module's fetch is this one)", async () => {
    stubFetch(0);
    const pending = new EngineClient(5123, "t0ken").getLibrarySummary();
    await vi.advanceTimersByTimeAsync(0);
    await pending;
    expect(callsBetween(0, Number.MAX_SAFE_INTEGER).map((c) => c.route)).toContain("/api/v1/library/summary");
  });
});
