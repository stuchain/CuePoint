import { afterEach, describe, expect, it, vi } from "vitest";

import { EngineClient, EngineError } from "./engineClient";

/** The two Beatport token routes only main calls (C12): there is no IPC for either. */

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
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("setBeatportSessionToken", () => {
  it("PUTs the token to the session route with the bearer, and answers the status", async () => {
    const calls = engineAnswering(200, { configured: true, masked: "••••abcd", source: "session" });

    const status = await new EngineClient(PORT, TOKEN).setBeatportSessionToken("session-abcd");

    expect(status).toEqual({ configured: true, masked: "••••abcd", source: "session" });
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/config/beatport-session`);
    expect(calls[0]!.init?.method).toBe("PUT");
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ token: "session-abcd" });
  });

  it("sends null to forget it", async () => {
    const calls = engineAnswering(200, { configured: false, masked: null, source: null });
    await new EngineClient(PORT, TOKEN).setBeatportSessionToken(null);
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ token: null });
  });

  it("rejects with the engine's refusal", async () => {
    engineAnswering(400, { error: { code: "INVALID_REQUEST", message: "token must be a string or null" } });
    await expect(new EngineClient(PORT, TOKEN).setBeatportSessionToken("x")).rejects.toBeInstanceOf(EngineError);
  });
});

describe("takeLegacyBeatportToken", () => {
  it("POSTs to take-legacy and answers the token", async () => {
    const calls = engineAnswering(200, { token: "legacy-1" });

    const answer = await new EngineClient(PORT, TOKEN).takeLegacyBeatportToken();

    expect(answer).toEqual({ token: "legacy-1" });
    expect(calls[0]!.url).toBe(`${BASE}/api/v1/config/beatport-token/take-legacy`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("answers null when the config key is empty", async () => {
    engineAnswering(200, { token: null });
    expect(await new EngineClient(PORT, TOKEN).takeLegacyBeatportToken()).toEqual({ token: null });
  });
});
