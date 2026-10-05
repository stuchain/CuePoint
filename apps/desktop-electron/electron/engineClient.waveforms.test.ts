import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineClient, WAVEFORM_REFUSAL_CODES, waveformBytes } from "./engineClient";

/**
 * Waveforms' client methods (WAVE-05).
 *
 * A picture crosses the wire as base64 and leaves main as bytes of its own:
 * decoded once here, so the renderer never parses a string, and copied out of
 * Node's buffer pool so IPC carries the picture and nothing more. Every method
 * answers `{ value, refusal }`.
 */

const PORT = 51237;
const TOKEN = "t0ken";
const BASE = `http://127.0.0.1:${PORT}`;

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a waveform's bytes", () => {
  it("decode from base64 into an array of exactly them", () => {
    const bytes = waveformBytes(Buffer.from([0, 1, 254, 255]).toString("base64"))!;

    expect(Array.from(bytes)).toEqual([0, 1, 254, 255]);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.isBuffer(bytes)).toBe(false);
    // Not a view on Node's shared pool, which IPC would carry whole.
    expect(bytes.buffer.byteLength).toBe(4);
    expect(bytes.byteOffset).toBe(0);
  });

  it("are none for a track without a picture", () => {
    expect(waveformBytes(null)).toBeNull();
  });
});

describe("getWaveforms", () => {
  it("GETs the batch by ids, width and marks, and answers bytes", async () => {
    const picture = Buffer.alloc(16 * 4, 200).toString("base64");
    const calls = engineAnswering(200, {
      width: 16,
      paused: true,
      waveforms: [
        { track_id: 3, state: "ready", reason: null, duration_ms: 1_000, data: picture, marks: null },
        { track_id: 4, state: "waiting", reason: null, duration_ms: null, data: null, marks: null },
      ],
      unknown: [9],
    });

    const answer = await client().getWaveforms({ track_ids: [3, 4, 9], width: 16, marks: true });

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/waveforms?track_ids=3%2C4%2C9&width=16&marks=1`);
    expect(calls[0]!.init?.method).toBeUndefined();
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(answer.refusal).toBeNull();
    const [ready, waiting] = answer.value!.waveforms;
    expect(ready!.data).toBeInstanceOf(Uint8Array);
    expect(ready!.data!.length).toBe(64);
    expect(waiting!.data).toBeNull();
    expect(answer.value!.paused).toBe(true);
    expect(answer.value!.unknown).toEqual([9]);
  });

  it("asks without marks unless told", async () => {
    const calls = engineAnswering(200, { width: 120, paused: false, waveforms: [], unknown: [] });

    await client().getWaveforms({ track_ids: [1], width: 120 });

    expect(calls[0]!.url).toContain("marks=0");
  });

  it("answers a refusal as a value", async () => {
    engineAnswering(400, { error: { code: "INVALID_REQUEST", message: "width must be 16 to 1200" } });

    const answer = await client().getWaveforms({ track_ids: [1], width: 8 });

    expect(answer).toEqual({
      value: null,
      refusal: { code: "INVALID_REQUEST", message: "width must be 16 to 1200" },
    });
  });

  it("throws what nobody can act on", async () => {
    engineAnswering(503, { error: { code: "WAVEFORMS_UNAVAILABLE", message: "The library is not available" } });

    await expect(client().getWaveforms({ track_ids: [1], width: 120 })).rejects.toThrow(
      "The library is not available",
    );
  });
});

describe("requests and deleting the data", () => {
  it("POSTs the requested ids", async () => {
    const calls = engineAnswering(200, { requested: [5], job_id: "job-1" });

    const answer = await client().requestWaveforms({ track_ids: [5] });

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/waveforms/request`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ track_ids: [5] });
    expect(answer.value).toEqual({ requested: [5], job_id: "job-1" });
  });

  it("POSTs the deletion with no fields", async () => {
    const calls = engineAnswering(200, { deleted: { waveforms: 2, freed_bytes: 10 }, analysis: {} });

    const answer = await client().deleteWaveformData();

    expect(calls[0]!.url).toBe(`${BASE}/api/v1/waveforms/delete-data`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({});
    expect(answer.value?.deleted).toEqual({ waveforms: 2, freed_bytes: 10 });
  });

  it("answers a store that could not be emptied as a refusal", async () => {
    expect(WAVEFORM_REFUSAL_CODES).toContain("WAVEFORMS_STORE_FAILED");
    engineAnswering(500, {
      error: { code: "WAVEFORMS_STORE_FAILED", message: "The waveform data could not be deleted" },
    });

    const answer = await client().deleteWaveformData();

    expect(answer.refusal).toEqual({
      code: "WAVEFORMS_STORE_FAILED",
      message: "The waveform data could not be deleted",
    });
  });
});
