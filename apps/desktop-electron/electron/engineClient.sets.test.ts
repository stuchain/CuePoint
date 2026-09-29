import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineClient, SET_REFUSAL_CODES, SET_REFUSAL_REASONS } from "./engineClient";

/**
 * A Set's client methods (PREP-08).
 *
 * A rejection crosses IPC as its message alone, so every Set method answers
 * `{ value, refusal }`: a Set that has gone, a gap that moved, a path the
 * engine will not write to, a time it cannot read — each comes back as a value
 * with its code and reason. What is left to throw is what nobody can act on.
 */

const PORT = 51236;
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
  it.each([
    ["getSetPlan", "plan"],
    ["getSetEntries", "entries"],
    ["getSetAnalysis", "analysis"],
    ["getSetListText", "set-list/text"],
  ] as const)("%s GETs /api/v1/sets/%s by the Set's id, with the token", async (name, route) => {
    const calls = engineAnswering(200, { set_id: 7 });

    const answer = await client()[name]({ set_id: 7 });

    expect(answer).toEqual({ value: { set_id: 7 }, refusal: null });
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/sets/${route}?set_id=7`);
    expect(method(calls[0]!)).toBe("GET");
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("names a gap and the Library's own pool in the query", async () => {
    const calls = engineAnswering(200, { suggestions: [] });

    await client().getSetSuggestions({
      set_id: 7,
      before_entry_id: 11,
      after_entry_id: null,
      against: "before",
      limit: 20,
      q: "deep",
      scope: "collection",
      collection_id: 3,
      filters: { match: "all", rules: [{ field: "genre", operator: "is", value: "House" }] },
    });

    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v1/sets/suggestions");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      set_id: "7",
      before_entry_id: "11",
      against: "before",
      limit: "20",
      q: "deep",
      scope: "collection",
      collection_id: "3",
      filters: JSON.stringify({
        match: "all",
        rules: [{ field: "genre", operator: "is", value: "House" }],
      }),
    });
  });

  it("sends no filters when there are no rules", async () => {
    const calls = engineAnswering(200, {});

    await client().getSetSuggestions({ set_id: 7, filters: { match: "all", rules: [] } });

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/sets/suggestions?set_id=7`);
  });
});

describe("actions", () => {
  it.each([
    ["createSet", "create", { name: "Friday", parent_id: 2 }],
    [
      "createSetFrom",
      "create-from",
      { source: { kind: "selection", track_ids: [3, 1] }, name: "Picked" },
    ],
    ["duplicateSet", "duplicate", { set_id: 7 }],
    ["setSetNotes", "notes", { set_id: 7, notes: null }],
    ["createSetChapter", "chapters/create", { set_id: 7, name: "Peak", after_chapter_id: 4 }],
    ["updateSetChapter", "chapters/update", { chapter_id: 4, target: "45:00", bpm_min: null }],
    ["moveSetChapter", "chapters/move", { chapter_id: 4, position: 0 }],
    ["deleteSetChapter", "chapters/delete", { chapter_id: 4 }],
    ["splitSetChapter", "chapters/split", { entry_id: 12, name: "Closing" }],
    ["moveSetEntry", "entries/move", { entry_id: 12, position: 3, chapter_id: 4 }],
    ["setSetEntryTimes", "entries/times", { entry_id: 12, in_time: "0:30", out_time: null }],
    ["setSetEntryNote", "entries/note", { entry_id: 12, note: "long blend" }],
    [
      "acknowledgeSetWarning",
      "acknowledge",
      { from_entry_id: 11, to_entry_id: 12, warning: "tempo_jump" },
    ],
    [
      "unacknowledgeSetWarning",
      "unacknowledge",
      { from_entry_id: 11, to_entry_id: 12, warning: "tempo_jump" },
    ],
    ["saveSetList", "set-list/save", { set_id: 7, destination_path: "/music/Friday.txt" }],
  ] as const)("%s POSTs its body to /api/v1/sets/%s", async (name, route, body) => {
    const calls = engineAnswering(200, { ok: true });

    // Each method's own parameter type is checked by the type-checker; here
    // the table is read as any one of them.
    const answer = await (client()[name] as (params: unknown) => Promise<unknown>)(body);

    expect(answer).toEqual({ value: { ok: true }, refusal: null });
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/sets/${route}`);
    expect(method(calls[0]!)).toBe("POST");
    expect(sent(calls[0]!)).toEqual(body);
  });

  it("leaves a chapter field out when it is not sent, so it keeps its value", async () => {
    const calls = engineAnswering(200, {});

    await client().updateSetChapter({ chapter_id: 4, name: "Peak" });

    expect(sent(calls[0]!)).toEqual({ chapter_id: 4, name: "Peak" });
  });

  it("inserts into a named chapter on the Collection route, the one path for an entry", async () => {
    const calls = engineAnswering(200, { entry: { id: 1 } });

    await client().insertTrackInCollection({
      collection_id: 7,
      track_id: 3,
      position: 2,
      chapter_id: 4,
    });

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/collections/tracks/insert`);
    expect(sent(calls[0]!)).toEqual({ collection_id: 7, track_id: 3, position: 2, chapter_id: 4 });
  });
});

describe("refusals, as values", () => {
  it.each([
    [404, "SET_NOT_FOUND", "set", null],
    [409, "SET_INSERTION_POINT_REFUSED", "stale", null],
    [400, "SET_LIST_DESTINATION_REFUSED", "destination_folder_missing", "/gone/Friday.txt"],
    [500, "SET_LIST_WRITE_FAILED", null, "/music/Friday.txt"],
    [400, "INVALID_REQUEST", null, null],
  ] as const)("a %i %s keeps its code, reason and path", async (status, code, reason, path) => {
    engineAnswering(status, {
      error: { code, message: "In the engine's words", reason, path },
    });

    const answer = await client().getSetPlan({ set_id: 7 });

    expect(answer).toEqual({
      value: null,
      refusal: { code, message: "In the engine's words", reason, path },
    });
  });

  it("reads a reason the engine never sends as none, and a missing path as null", async () => {
    engineAnswering(404, { error: { code: "SET_NOT_FOUND", message: "gone", reason: "planet" } });

    const answer = await client().getSetEntries({ set_id: 7 });

    expect(answer.refusal).toEqual({
      code: "SET_NOT_FOUND",
      message: "gone",
      reason: null,
      path: null,
    });
  });

  it("throws what nobody can act on: an unavailable library, a failure", async () => {
    engineAnswering(503, { error: { code: "LIBRARY_UNAVAILABLE", message: "No database" } });
    await expect(client().getSetPlan({ set_id: 7 })).rejects.toThrow("No database");

    engineAnswering(500, { error: { code: "SETS_FAILED", message: "bug" } });
    await expect(client().createSet({ name: "X" })).rejects.toThrow("bug");
  });

  it("throws on an answer that is not JSON", async () => {
    engineAnswering(502, null, "<html>bad gateway</html>");
    await expect(client().getSetPlan({ set_id: 7 })).rejects.toThrow(
      "Engine request failed (502)",
    );
  });

  it("names every code and reason exactly once", () => {
    expect(new Set(SET_REFUSAL_CODES).size).toBe(SET_REFUSAL_CODES.length);
    expect(new Set(SET_REFUSAL_REASONS).size).toBe(SET_REFUSAL_REASONS.length);
  });
});
