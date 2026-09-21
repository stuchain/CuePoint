import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineClient, REKORDBOX_EXPORT_REFUSAL_CODES } from "./engineClient";

/**
 * The Rekordbox export's client methods (EXPORT-06).
 *
 * A rejection crosses IPC as its message alone, so the refusals a person can
 * act on — a source to find or import, a destination to change, a job to wait
 * for — come back from the client as a value carrying the engine's reason.
 * Anything else still throws: a malformed request is a bug, not a state to
 * draw.
 */

const PORT = 51234;
const TOKEN = "t0ken";

type Call = { url: string; init: RequestInit | undefined };

function engineAnswering(status: number, body: unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return calls;
}

const client = () => new EngineClient(PORT, TOKEN);

const PREVIEW = { track_count: 3, playlists: [], key_format: "normal" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("previewRekordboxExport", () => {
  it("POSTs the selection to the preview route with the token", async () => {
    const calls = engineAnswering(200, { preview: PREVIEW });

    await client().previewRekordboxExport({ collection_ids: [4], key_format: "camelot" });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`http://127.0.0.1:${PORT}/api/v1/rekordbox-export/preview`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({
      collection_ids: [4],
      key_format: "camelot",
    });
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("answers the preview, with no refusal", async () => {
    engineAnswering(200, { preview: PREVIEW });

    await expect(client().previewRekordboxExport({})).resolves.toEqual({
      preview: PREVIEW,
      refusal: null,
    });
  });

  it("answers a source refusal as a value, with its reason and path", async () => {
    engineAnswering(409, {
      error: {
        code: "REKORDBOX_EXPORT_SOURCE_REFUSED",
        message: "The collection file is no longer there: C:/c.xml",
        reason: "source_missing",
        path: "C:/c.xml",
      },
    });

    await expect(client().previewRekordboxExport({})).resolves.toEqual({
      preview: null,
      refusal: {
        code: "REKORDBOX_EXPORT_SOURCE_REFUSED",
        message: "The collection file is no longer there: C:/c.xml",
        reason: "source_missing",
        path: "C:/c.xml",
        job_id: null,
        job_type: null,
      },
    });
  });

  it("answers a library never imported with no path", async () => {
    engineAnswering(409, {
      error: {
        code: "REKORDBOX_EXPORT_SOURCE_REFUSED",
        message: "Import a library first",
        reason: "source_never_imported",
        path: null,
      },
    });

    const answer = await client().previewRekordboxExport({});

    expect(answer.refusal?.reason).toBe("source_never_imported");
    expect(answer.refusal?.path).toBeNull();
  });

  it("throws a malformed request in the engine's words", async () => {
    engineAnswering(400, {
      error: { code: "INVALID_REQUEST", message: "collection_ids must hold whole numbers only" },
    });

    await expect(client().previewRekordboxExport({})).rejects.toThrow(
      /^collection_ids must hold whole numbers only$/,
    );
  });

  it("throws a server failure rather than drawing it as a refusal", async () => {
    engineAnswering(500, { error: { code: "REKORDBOX_EXPORT_FAILED", message: "surprise" } });

    await expect(client().previewRekordboxExport({})).rejects.toThrow("surprise");
  });

  it("throws an unreachable library", async () => {
    engineAnswering(503, { error: { code: "LIBRARY_UNAVAILABLE", message: "database is locked" } });

    await expect(client().previewRekordboxExport({})).rejects.toThrow("database is locked");
  });

  it("says the status when the engine gives no words", async () => {
    engineAnswering(502, {});

    await expect(client().previewRekordboxExport({})).rejects.toThrow("(502)");
  });
});

describe("startRekordboxExport", () => {
  const STARTED = {
    job_id: "j-1",
    id: "j-1",
    state: "queued",
    collection_ids: [4],
    key_format: "normal",
    destination_path: "C:/Exports/out.xml",
  };

  it("POSTs to the start route and answers what started", async () => {
    const calls = engineAnswering(202, STARTED);

    const answer = await client().startRekordboxExport({
      collection_ids: [4],
      destination_path: "C:/Exports/out.xml",
    });

    expect(calls[0]!.url).toBe(`http://127.0.0.1:${PORT}/api/v1/rekordbox-export/start`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(answer).toEqual({ started: STARTED, refusal: null });
  });

  it("answers the source as the destination as a typed refusal", async () => {
    engineAnswering(400, {
      error: {
        code: "REKORDBOX_EXPORT_DESTINATION_REFUSED",
        message: "Refusing to write the export over the collection it was read from",
        reason: "destination_is_source",
        path: "C:/c.xml",
      },
    });

    const answer = await client().startRekordboxExport({ destination_path: "C:/c.xml" });

    expect(answer.started).toBeNull();
    expect(answer.refusal).toMatchObject({
      code: "REKORDBOX_EXPORT_DESTINATION_REFUSED",
      reason: "destination_is_source",
      path: "C:/c.xml",
    });
  });

  it("answers a busy library with the job to follow", async () => {
    engineAnswering(409, {
      error: {
        code: "LIBRARY_BUSY",
        message: "A library_import job is already running: j-9",
        job_id: "j-9",
        job_type: "library_import",
      },
    });

    const answer = await client().startRekordboxExport({ destination_path: "C:/out.xml" });

    expect(answer.refusal).toEqual({
      code: "LIBRARY_BUSY",
      message: "A library_import job is already running: j-9",
      reason: null,
      path: null,
      job_id: "j-9",
      job_type: "library_import",
    });
  });

  it("reads a field of the wrong type as absent rather than passing it on", async () => {
    engineAnswering(400, {
      error: {
        code: "REKORDBOX_EXPORT_DESTINATION_REFUSED",
        message: "No destination",
        reason: 7,
        path: { not: "a path" },
      },
    });

    const answer = await client().startRekordboxExport({ destination_path: "" });

    expect(answer.refusal?.reason).toBeNull();
    expect(answer.refusal?.path).toBeNull();
  });
});

describe("getRekordboxExportHistory", () => {
  it("GETs the history, with a limit only when asked", async () => {
    const calls = engineAnswering(200, { exports: [], limit: 20, remembered: {} });

    await client().getRekordboxExportHistory();
    await client().getRekordboxExportHistory({ limit: 1 });

    expect(calls.map((call) => call.url)).toEqual([
      `http://127.0.0.1:${PORT}/api/v1/rekordbox-export/history`,
      `http://127.0.0.1:${PORT}/api/v1/rekordbox-export/history?limit=1`,
    ]);
    expect(calls.every((call) => (call.init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("throws a failure: there is no refusal a history can have", async () => {
    engineAnswering(503, { error: { code: "LIBRARY_UNAVAILABLE", message: "down" } });

    await expect(client().getRekordboxExportHistory()).rejects.toThrow("down");
  });
});

describe("the refusal codes", () => {
  it("are the three the engine types, and no generic one", () => {
    expect([...REKORDBOX_EXPORT_REFUSAL_CODES].sort()).toEqual([
      "LIBRARY_BUSY",
      "REKORDBOX_EXPORT_DESTINATION_REFUSED",
      "REKORDBOX_EXPORT_SOURCE_REFUSED",
    ]);
    expect(REKORDBOX_EXPORT_REFUSAL_CODES).not.toContain("INVALID_REQUEST");
  });
});
