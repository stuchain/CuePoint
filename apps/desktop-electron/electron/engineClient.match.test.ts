import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineClient } from "./engineClient";

/** The Match area's client methods (C14): Correct, past searches, candidate media. */

const PORT = 51237;
const TOKEN = "t0ken";
const BASE = `http://127.0.0.1:${PORT}`;

type Call = { url: string; init: RequestInit | undefined };

function engineAnswering(make: () => Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return make();
    }),
  );
  return calls;
}

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const client = () => new EngineClient(PORT, TOKEN);
const sent = (call: Call) => JSON.parse(String(call.init?.body));
const auth = (call: Call) =>
  (call.init?.headers as Record<string, string>).Authorization;

const thrown = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("correct", () => {
  it("POSTs one track's candidate and fields to /clean/correct", async () => {
    const answer = { batch_id: null, changed: false, key: null };
    const calls = engineAnswering(json(200, answer));

    const outcome = await client().correctMatch({
      track_id: 7,
      candidate_id: 31,
      fields: ["bpm", "label"],
      replace_key: true,
    });

    expect(outcome).toEqual(answer);
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/clean/correct`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(auth(calls[0]!)).toBe(`Bearer ${TOKEN}`);
    expect(sent(calls[0]!)).toEqual({
      track_id: 7,
      candidate_id: 31,
      fields: ["bpm", "label"],
      replace_key: true,
    });
  });

  it("POSTs a selection to the same route, with no candidate", async () => {
    const calls = engineAnswering(json(202, { job_id: "j1", id: "j1", state: "queued" }));

    const outcome = await client().correctMatches({
      selection: { track_ids: [1, 2] },
      fields: [],
    });

    expect(outcome.job_id).toBe("j1");
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/clean/correct`);
    expect(sent(calls[0]!)).toEqual({ selection: { track_ids: [1, 2] }, fields: [] });
  });

  it("maps the error envelope to an EngineError", async () => {
    engineAnswering(
      json(404, { error: { code: "CANDIDATE_NOT_FOUND", message: "No candidate", report_id: "r1" } }),
    );

    const error = await thrown(
      client().correctMatch({ track_id: 1, candidate_id: 9, fields: [] }),
    );

    expect(error).toMatchObject({ status: 404, code: "CANDIDATE_NOT_FOUND", reportId: "r1" });
  });
});

describe("past searches", () => {
  it("GETs /clean/match/jobs with no query by default", async () => {
    const calls = engineAnswering(json(200, { jobs: [], total: 0 }));

    expect(await client().getMatchJobs()).toEqual({ jobs: [], total: 0 });
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/clean/match/jobs`);
    expect(calls[0]!.init?.method ?? "GET").toBe("GET");
  });

  it("pages and searches, encoding the text", async () => {
    const calls = engineAnswering(json(200, { jobs: [], total: 0 }));

    await client().getMatchJobs({ q: "house & techno", limit: 20, offset: 40 });

    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v1/clean/match/jobs");
    expect(url.searchParams.get("q")).toBe("house & techno");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("offset")).toBe("40");
  });

  it("sends a label when a search is started", async () => {
    const calls = engineAnswering(json(202, { job_id: "j", id: "j", state: "queued" }));

    await client().startCleanMatch({
      selection: { track_ids: [1] },
      label: "Friday crate",
    });

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/clean/match`);
    expect(sent(calls[0]!)).toEqual({ selection: { track_ids: [1] }, label: "Friday crate" });
  });
});

describe("candidate artwork", () => {
  it("GETs the sized route and returns the bytes", async () => {
    const calls = engineAnswering(
      () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } }),
    );

    const bytes = await client().getCandidateArtwork({ candidateId: 12, size: "inspector" });

    expect(Array.from(bytes!)).toEqual([1, 2, 3]);
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/clean/candidates/12/artwork?size=inspector`);
    expect(auth(calls[0]!)).toBe(`Bearer ${TOKEN}`);
  });

  it("answers null for 204", async () => {
    engineAnswering(() => new Response(null, { status: 204 }));

    expect(await client().getCandidateArtwork({ candidateId: 12, size: "row" })).toBeNull();
  });

  it("maps 404 CANDIDATE_NOT_FOUND to an EngineError", async () => {
    engineAnswering(json(404, { error: { code: "CANDIDATE_NOT_FOUND", message: "No candidate" } }));

    const error = await thrown(client().getCandidateArtwork({ candidateId: 1, size: "row" }));

    expect(error).toMatchObject({ status: 404, code: "CANDIDATE_NOT_FOUND" });
  });

  it("refuses something that is not a JPEG", async () => {
    engineAnswering(() => new Response("x", { headers: { "Content-Type": "text/html" } }));

    await expect(client().getCandidateArtwork({ candidateId: 1, size: "row" })).rejects.toThrow(
      /JPEG/,
    );
  });
});

describe("candidate preview", () => {
  it.each(["audio/mpeg", "audio/mp4"])("returns the bytes and %s as named", async (type) => {
    const calls = engineAnswering(
      () => new Response(new Uint8Array([9, 8]), { headers: { "Content-Type": type } }),
    );

    const preview = await client().getCandidatePreview({ candidateId: 5 });

    expect(preview?.contentType).toBe(type);
    expect(Array.from(preview!.bytes)).toEqual([9, 8]);
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/clean/candidates/5/preview`);
  });

  it("answers null for 204", async () => {
    engineAnswering(() => new Response(null, { status: 204 }));

    expect(await client().getCandidatePreview({ candidateId: 5 })).toBeNull();
  });

  it("maps 404 CANDIDATE_NOT_FOUND to an EngineError", async () => {
    engineAnswering(json(404, { error: { code: "CANDIDATE_NOT_FOUND", message: "No candidate" } }));

    const error = await thrown(client().getCandidatePreview({ candidateId: 5 }));

    expect(error).toMatchObject({ status: 404, code: "CANDIDATE_NOT_FOUND" });
  });

  it("refuses something that is not audio", async () => {
    engineAnswering(() => new Response("x", { headers: { "Content-Type": "image/jpeg" } }));

    await expect(client().getCandidatePreview({ candidateId: 5 })).rejects.toThrow(/audio/);
  });
});

describe("catalog preview", () => {
  it("returns the bytes and type from the discover route", async () => {
    const calls = engineAnswering(
      () => new Response(new Uint8Array([7, 6]), { headers: { "Content-Type": "audio/mpeg" } }),
    );

    const preview = await client().getCatalogPreview({ beatportTrackId: 1234 });

    expect(preview?.contentType).toBe("audio/mpeg");
    expect(Array.from(preview!.bytes)).toEqual([7, 6]);
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/discover/tracks/1234/preview`);
  });

  it("answers null for 204", async () => {
    engineAnswering(() => new Response(null, { status: 204 }));

    expect(await client().getCatalogPreview({ beatportTrackId: 1234 })).toBeNull();
  });

  it("maps an engine error to an EngineError", async () => {
    engineAnswering(json(400, { error: { code: "VALIDATION_ERROR", message: "Bad id" } }));

    const error = await thrown(client().getCatalogPreview({ beatportTrackId: 1234 }));

    expect(error).toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("refuses something that is not audio, and an id that is not one", async () => {
    engineAnswering(() => new Response("x", { headers: { "Content-Type": "image/jpeg" } }));

    await expect(client().getCatalogPreview({ beatportTrackId: 1234 })).rejects.toThrow(/audio/);
    await expect(client().getCatalogPreview({ beatportTrackId: 0 })).rejects.toThrow(/positive/);
    await expect(client().getCatalogPreview({ beatportTrackId: 2147483648 })).rejects.toThrow(/positive/);
    await expect(client().getCatalogPreview({ beatportTrackId: 1.5 })).rejects.toThrow(/positive/);
    await expect(
      client().getCatalogPreview(undefined as unknown as { beatportTrackId: number }),
    ).rejects.toThrow(/positive/);
  });
});

describe("match review", () => {
  it("GETs /clean/match/review for a run", async () => {
    const calls = engineAnswering(json(200, { job_id: "r", label: null, total: 0, counts: {}, tracks: [] }));

    await client().getMatchReview({ jobId: "r" });

    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v1/clean/match/review");
    expect(url.searchParams.get("job_id")).toBe("r");
    expect(calls[0]!.init?.method ?? "GET").toBe("GET");
  });

  it("asks for a playlist's by id, and for everything with no params", async () => {
    const calls = engineAnswering(json(200, { job_id: null, label: null, total: 0, counts: {}, tracks: [] }));

    await client().getMatchReview({ playlistId: 7, limit: 50 });
    await client().getMatchReview();

    const first = new URL(calls[0]!.url);
    expect(first.searchParams.get("playlist_id")).toBe("7");
    expect(first.searchParams.get("limit")).toBe("50");
    expect(calls[1]!.url).toBe(`${BASE}/api/v1/clean/match/review`);
  });

  it("asks for a page, or only the ids of the ticked tracks, leaving the rest off the wire", async () => {
    const calls = engineAnswering(json(200, { job_id: "r", label: null, total: 0, counts: {}, tracks: [] }));

    await client().getMatchReview({ jobId: "r", tickedIds: true });
    await client().getMatchReview({ jobId: "r", after: "0:1999", limit: 2000 });

    const first = new URL(calls[0]!.url);
    expect(first.searchParams.get("ticked_ids")).toBe("true");
    expect(first.searchParams.has("filter")).toBe(false);
    const second = new URL(calls[1]!.url);
    expect(second.searchParams.has("ticked_ids")).toBe(false);
    expect(second.searchParams.get("after")).toBe("0:1999");
    expect(second.searchParams.get("limit")).toBe("2000");
  });
});

describe("ticking tracks of a review", () => {
  it("POSTs the ticked answer and the tracks to /clean/match/ticks", async () => {
    const calls = engineAnswering(json(200, { ticked: false, changed: 1, skipped: 0, batch_id: "b" }));

    await client().setMatchTicks({ ticked: false, track_ids: [7, 8] });

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/clean/match/ticks`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(sent(calls[0]!)).toEqual({ ticked: false, track_ids: [7, 8] });
  });

  it("names a whole review by its scope", async () => {
    const calls = engineAnswering(json(200, { ticked: true, changed: 0, skipped: 0, batch_id: null }));

    await client().setMatchTicks({ ticked: true, scope: { playlist_id: 3 } });

    expect(sent(calls[0]!)).toEqual({ ticked: true, scope: { playlist_id: 3 } });
  });
});

describe("searching by hand and undoing one track", () => {
  it("POSTs the track and the words to /clean/match/search", async () => {
    const calls = engineAnswering(json(200, { attempt_id: 1, track_id: 7, candidates: [], total: 0 }));

    await client().searchMatch({ track_id: 7, query: "glue bicep" });

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/clean/match/search`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(sent(calls[0]!)).toEqual({ track_id: 7, query: "glue bicep" });
  });

  it("names the track when only one track of a batch is reverted", async () => {
    const calls = engineAnswering(json(200, { reverted: {} }));

    await client().revertBatch({ batch_id: "b", track_id: 4 });

    expect(sent(calls[0]!)).toEqual({ batch_id: "b", track_id: 4 });
  });
});

describe("syncing a review", () => {
  it("POSTs the selection and options to /clean/sync-preview, which writes nothing", async () => {
    const calls = engineAnswering(json(200, { preview: { preview_id: "p" } }));

    await client().previewSync({ selection: { track_ids: [1, 2] }, options: { write_genre: true } });

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/clean/sync-preview`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(sent(calls[0]!)).toEqual({ selection: { track_ids: [1, 2] }, options: { write_genre: true } });
  });

  it("POSTs the kept preview's id and the chosen options to /clean/sync", async () => {
    const calls = engineAnswering(json(202, { job_id: "j", preview_id: "p" }));

    await client().startSync({ preview_id: "p", options: { write_bpm: true } });

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/clean/sync`);
    expect(sent(calls[0]!)).toEqual({ preview_id: "p", options: { write_bpm: true } });
  });
});
