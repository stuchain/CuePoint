import { afterEach, describe, expect, it, vi } from "vitest";

import { BEATPORT_ERROR_CLASSES, DISCOVER_REFUSAL_CODES, EngineClient } from "./engineClient";

/**
 * Discover's client methods (DISCOVER-09).
 *
 * A rejection crosses IPC as its message alone, so every Discover method
 * answers `{ value, refusal }`: a refusal a person can act on — no token, a
 * token Beatport refused, a job already running, a run that is gone, a value
 * the engine refused — comes back as a value with its code, and the Beatport
 * ones with their class. What is left to throw is what nobody can act on.
 */

const PORT = 51235;
const TOKEN = "t0ken";
const BASE = `http://127.0.0.1:${PORT}`;

type Call = { url: string; init: RequestInit | undefined };

function engineAnswering(status: number, body: unknown, raw?: string): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(raw ?? JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return calls;
}

const client = () => new EngineClient(PORT, TOKEN);

const method = (call: Call) => call.init?.method ?? "GET";
const sent = (call: Call) => JSON.parse(String(call.init?.body));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reads", () => {
  it("GETs the options with the token and answers them as the value", async () => {
    const calls = engineAnswering(200, { genres: [] });

    const answer = await client().getDiscoverOptions();

    expect(answer).toEqual({ value: { genres: [] }, refusal: null });
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/discover/options`);
    expect(method(calls[0]!)).toBe("GET");
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("sends a window only when asked", async () => {
    const calls = engineAnswering(200, { runs: [] });

    await client().listDiscoveryRuns();
    await client().listDiscoveryRuns({ limit: 20, offset: 40 });

    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/api/v1/discover/runs`,
      `${BASE}/api/v1/discover/runs?limit=20&offset=40`,
    ]);
  });

  it("puts a run's id in its path, and its window in the query", async () => {
    const calls = engineAnswering(200, {});

    await client().getDiscoveryRun({ run_id: 7 });
    await client().getDiscoveryRunTracks({ run_id: 7, owned: "all", sort: "title", dir: "desc" });
    await client().getDiscoveryRunTracks({ run_id: 7, offset: 0, limit: 100 });

    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/api/v1/discover/runs/7`,
      `${BASE}/api/v1/discover/runs/7/tracks?owned=all&sort=title&dir=desc`,
      `${BASE}/api/v1/discover/runs/7/tracks?offset=0&limit=100`,
    ]);
    expect(calls.every((c) => method(c) === "GET")).toBe(true);
  });

  it("reads the wantlist with its two filters", async () => {
    const calls = engineAnswering(200, {});

    await client().getWantlist();
    await client().getWantlist({ bought: "only", owned: "hide" });

    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/api/v1/discover/wantlist`,
      `${BASE}/api/v1/discover/wantlist?bought=only&owned=hide`,
    ]);
  });

  it("encodes a page's reference, and sends refresh as a word", async () => {
    const calls = engineAnswering(200, {});

    await client().getEntityPage({ kind: "artist", ref: "name:Âme & Dixon" });
    await client().getEntityBeatport({ kind: "label", ref: "bp:40211", refresh: true, limit: 50 });

    const first = new URL(calls[0]!.url);
    expect(first.pathname).toBe("/api/v1/discover/entity");
    expect(first.searchParams.get("ref")).toBe("name:Âme & Dixon");
    expect(first.searchParams.get("kind")).toBe("artist");
    expect(calls[1]!.url).toBe(
      `${BASE}/api/v1/discover/entity/beatport?kind=label&ref=bp%3A40211&refresh=true&limit=50`,
    );
  });

  it("sends Similar Tracks' scope as the Library does, and filters only when there are some", async () => {
    const calls = engineAnswering(200, {});
    const filters = { match: "all" as const, rules: [{ field: "genre", operator: "is", value: "House" }] };

    await client().getSimilarTracks({ track_id: 12 });
    await client().getSimilarTracks({
      track_id: 12,
      limit: 20,
      q: "dub",
      playlist_id: null,
      scope: "collection",
      collection_id: 4,
      filters,
    });
    await client().getSimilarTracks({ track_id: 12, filters: { match: "all", rules: [] } });

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/discover/similar?track_id=12`);
    const scoped = new URL(calls[1]!.url);
    expect(Object.fromEntries(scoped.searchParams)).toEqual({
      track_id: "12",
      limit: "20",
      q: "dub",
      scope: "collection",
      collection_id: "4",
      filters: JSON.stringify(filters),
    });
    expect(calls[2]!.url).toBe(`${BASE}/api/v1/discover/similar?track_id=12`);
  });
});

describe("actions", () => {
  it("POSTs each to its own route with its body", async () => {
    const calls = engineAnswering(200, {});
    const c = client();

    await c.startDiscoveryRun({ genre_ids: [5], artists: null });
    await c.startDiscoveryRun();
    await c.deleteDiscoveryRun({ run_id: 3 });
    await c.addToWantlist({ track_ids: [1, 2], run_id: 3 });
    await c.removeFromWantlist({ track_ids: [2] });
    await c.setWantlistNote({ track_id: 1, note: null });
    await c.setWantlistBought({ track_ids: [1], bought: true });
    await c.startBeatportPlaylistPush({ run_id: 3, owned: "hide", name: "Picks" });
    await c.startBeatportResolve();

    expect(calls.every((call) => method(call) === "POST")).toBe(true);
    expect(calls.map((call) => [new URL(call.url).pathname, sent(call)])).toEqual([
      ["/api/v1/discover/runs/start", { genre_ids: [5], artists: null }],
      ["/api/v1/discover/runs/start", {}],
      ["/api/v1/discover/runs/3/delete", {}],
      ["/api/v1/discover/wantlist/add", { track_ids: [1, 2], run_id: 3 }],
      ["/api/v1/discover/wantlist/remove", { track_ids: [2] }],
      ["/api/v1/discover/wantlist/note", { track_id: 1, note: null }],
      ["/api/v1/discover/wantlist/bought", { track_ids: [1], bought: true }],
      ["/api/v1/discover/playlist/start", { run_id: 3, owned: "hide", name: "Picks" }],
      ["/api/v1/discover/resolve/start", {}],
    ]);
  });

  it("answers a started job as the value", async () => {
    engineAnswering(202, { id: "j-1", type: "discovery", state: "queued" });

    await expect(client().startDiscoveryRun()).resolves.toEqual({
      value: { id: "j-1", type: "discovery", state: "queued" },
      refusal: null,
    });
  });
});

describe("refusals", () => {
  it("answers a Beatport refusal as a value with its class", async () => {
    engineAnswering(429, {
      error: {
        code: "BEATPORT_REFUSED",
        message: "Rate limited; try again later",
        reason: "rate_limited",
        retry_after: 12.5,
      },
    });

    await expect(client().startBeatportResolve()).resolves.toEqual({
      value: null,
      refusal: {
        code: "BEATPORT_REFUSED",
        message: "Rate limited; try again later",
        reason: "rate_limited",
        retry_after: 12.5,
        job_id: null,
        job_type: null,
      },
    });
  });

  it.each([
    [409, "no_token"],
    [409, "rejected"],
    [409, "forbidden"],
    [502, "unavailable"],
  ])("answers a %s %s as a value", async (status, reason) => {
    engineAnswering(status, {
      error: { code: "BEATPORT_REFUSED", message: "no", reason, retry_after: null },
    });

    const answer = await client().startDiscoveryRun();

    expect(answer.refusal?.reason).toBe(reason);
    expect(answer.value).toBeNull();
  });

  it("answers a busy job with the job to follow", async () => {
    engineAnswering(409, {
      error: {
        code: "DISCOVER_BUSY",
        message: "A discovery job is already running: j-9",
        job_id: "j-9",
        job_type: "discovery",
      },
    });

    const answer = await client().startDiscoveryRun();

    expect(answer.refusal).toEqual({
      code: "DISCOVER_BUSY",
      message: "A discovery job is already running: j-9",
      reason: null,
      retry_after: null,
      job_id: "j-9",
      job_type: "discovery",
    });
  });

  it.each([
    [400, "INVALID_REQUEST", "A note is at most 1000 characters"],
    [404, "DISCOVERY_RUN_NOT_FOUND", "No discovery run 7"],
    [409, "DISCOVERY_RUN_RUNNING", "Discovery run 7 is still running; cancel it first"],
    [404, "TRACK_NOT_FOUND", "There is no track 7 in the library"],
  ])("answers a %s %s as a value in the engine's words", async (status, code, message) => {
    engineAnswering(status, { error: { code, message } });

    const answer = await client().deleteDiscoveryRun({ run_id: 7 });

    expect(answer.refusal).toMatchObject({ code, message, reason: null, retry_after: null });
  });

  it("reads a field of the wrong type, or a class it does not know, as absent", async () => {
    engineAnswering(409, {
      error: {
        code: "BEATPORT_REFUSED",
        message: "odd",
        reason: "on_fire",
        retry_after: "soon",
        job_id: 7,
      },
    });

    const answer = await client().startBeatportResolve();

    expect(answer.refusal).toMatchObject({ reason: null, retry_after: null, job_id: null });
  });

  it("throws what nobody can act on, in the engine's words", async () => {
    engineAnswering(503, { error: { code: "LIBRARY_UNAVAILABLE", message: "database is locked" } });
    await expect(client().getWantlist()).rejects.toThrow("database is locked");

    engineAnswering(500, { error: { code: "DISCOVER_FAILED", message: "surprise" } });
    await expect(client().getDiscoverOptions()).rejects.toThrow("surprise");

    engineAnswering(404, { error: { code: "NOT_FOUND", message: "Unknown path" } });
    await expect(client().getDiscoverOptions()).rejects.toThrow("Unknown path");
  });

  it("says the status when the engine gives no words, or no JSON", async () => {
    engineAnswering(502, {});
    await expect(client().getDiscoverOptions()).rejects.toThrow("(502)");

    engineAnswering(500, null, "<html>not json</html>");
    await expect(client().getDiscoverOptions()).rejects.toThrow("(500)");
  });

  it("names every code a refusal can carry, and the five Beatport classes", () => {
    expect([...DISCOVER_REFUSAL_CODES].sort()).toEqual([
      "BEATPORT_REFUSED",
      "DISCOVERY_RUN_NOT_FOUND",
      "DISCOVERY_RUN_RUNNING",
      "DISCOVER_BUSY",
      "INVALID_REQUEST",
      "TRACK_NOT_FOUND",
    ]);
    expect([...BEATPORT_ERROR_CLASSES].sort()).toEqual([
      "forbidden",
      "no_token",
      "rate_limited",
      "rejected",
      "unavailable",
    ]);
  });
});
