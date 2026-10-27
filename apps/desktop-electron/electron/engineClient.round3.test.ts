import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineClient } from "./engineClient";

/**
 * The client methods polish round 3 added (work orders WO-1 and WO-3): Keep on a duplicate
 * group, and what the Library holds that is not out in the world yet.
 */

const PORT = 51237;
const TOKEN = "t0ken";
const BASE = `http://127.0.0.1:${PORT}`;

type Call = { url: string; init: RequestInit | undefined };

function engineAnswering(body: unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("keepDuplicateTrack (M153)", () => {
  it("POSTs the group and the track to the keep route, with the token", async () => {
    const calls = engineAnswering({ group: { id: 4 }, kept_track_id: 9 });

    const answer = await new EngineClient(PORT, TOKEN).keepDuplicateTrack({ group_id: 4, track_id: 9 });

    expect(answer).toEqual({ group: { id: 4 }, kept_track_id: 9 });
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/clean/duplicates/keep`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ group_id: 4, track_id: 9 });
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });
});

describe("getLibraryPending (M511)", () => {
  it("GETs the pending route with the token", async () => {
    const body = { values_not_in_files: 12, changes_not_exported: 30, last_export_at: null };
    const calls = engineAnswering(body);

    const answer = await new EngineClient(PORT, TOKEN).getLibraryPending();

    expect(answer).toEqual(body);
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/library/pending`);
    expect(calls[0]!.init?.method ?? "GET").toBe("GET");
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });
});
