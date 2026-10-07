/**
 * A refusal reaches the renderer in the engine's own words (CLEAN-13).
 *
 * Electron wraps a rejected `invoke` in "Error invoking remote method …". The
 * preload unwraps every method's rejection, so a sentence shown beside a field
 * is the engine's sentence. The preload is run here with a fake `electron`, as
 * the real one would run it, because it is a script, not a module.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { BRIDGE_ERROR_MARKER, bridgeSafeError } from "./bridgeError";
import { EngineError } from "./engineClient";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "preload.cjs"), "utf-8");

type Api = Record<string, unknown> & { player: Record<string, unknown> };

function load(invoke: (channel: string, ...args: unknown[]) => Promise<unknown>): Api {
  let exposed: Api | null = null;
  const electron = {
    contextBridge: { exposeInMainWorld: (_name: string, api: Api) => (exposed = api) },
    ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn() },
    webUtils: { getPathForFile: () => "C:\\dropped.xml" },
  };
  new Function("require", source)((name: string) => {
    if (name !== "electron") throw new Error(`unexpected require ${name}`);
    return electron;
  });
  return exposed!;
}

describe("a method's rejection", () => {
  it("carries the engine's words, not Electron's wrapper", async () => {
    const api = load(() =>
      Promise.reject(
        new Error(
          "Error invoking remote method 'engine:setTrackOverrides': Error: bpm must be between 20 and 300, not 400",
        ),
      ),
    );
    const call = (api.setTrackOverrides as (p: unknown) => Promise<unknown>)({ trackId: 1, bpm: 400 });
    await expect(call).rejects.toThrow(/^bpm must be between 20 and 300, not 400$/);
  });

  it("unwraps an error of another kind, and in nested namespaces", async () => {
    const api = load(() =>
      Promise.reject(new Error("Error invoking remote method 'player:seek': TypeError: not a number")),
    );
    await expect((api.player.seek as (s: number) => Promise<unknown>)(1)).rejects.toThrow(/^not a number$/);
  });

  it("leaves any other rejection as it was", async () => {
    const original = new Error("The engine is not connected.");
    const api = load(() => Promise.reject(original));
    await expect((api.getTags as () => Promise<unknown>)()).rejects.toBe(original);
  });

  it("passes answers, arguments and synchronous methods through untouched", async () => {
    const invoke = vi.fn(async (channel: string, params: unknown) => ({ channel, params }));
    const api = load(invoke);
    await expect((api.getTrackMatches as (p: unknown) => Promise<unknown>)({ trackId: 3 })).resolves.toEqual({
      channel: "engine:getTrackMatches",
      params: { trackId: 3 },
    });
    const unsubscribe = (api.player.subscribeState as (fn: () => void) => () => void)(() => undefined);
    expect(typeof unsubscribe).toBe("function");
  });
});

/** What Electron makes of a rejected `invoke` whose handler threw `error`: the message, wrapped. */
function crossed(channel: string, error: unknown): Error {
  const thrown = error as Error;
  return new Error(`Error invoking remote method '${channel}': Error: ${thrown.message}`);
}

describe("an engine error across the bridge (REPORT-04, DEC-126)", () => {
  type Fields = { status: number | null; code: string | null; reportId: string | null };
  const fieldsOf = (e: unknown): Fields => {
    const { status, code, reportId } = e as Fields;
    return { status, code, reportId };
  };

  it("gives the renderer the words, the status, the code and the report id", async () => {
    const sent = bridgeSafeError(
      new EngineError("The library failed.", { status: 500, code: "LIBRARY_FAILED", reportId: "r1" }),
    );
    const api = load(() => Promise.reject(crossed("engine:getTags", sent)));

    const error = await (api.getTags as () => Promise<unknown>)().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("The library failed.");
    expect(fieldsOf(error)).toEqual({ status: 500, code: "LIBRARY_FAILED", reportId: "r1" });
  });

  it("has a null report id for a refusal", async () => {
    const sent = bridgeSafeError(new EngineError("bpm must be between 20 and 300", { status: 400, code: "INVALID_REQUEST" }));
    const api = load(() => Promise.reject(crossed("engine:setTrackOverrides", sent)));

    const error = await (api.setTrackOverrides as (p: unknown) => Promise<unknown>)({}).catch((e: unknown) => e);

    expect((error as Error).message).toBe("bpm must be between 20 and 300");
    expect(fieldsOf(error)).toEqual({ status: 400, code: "INVALID_REQUEST", reportId: null });
  });

  it("keeps an engine error's words whatever they hold, even a colon, a quote or a newline", async () => {
    const words = `Could not read "a: b'\nsecond line {"status": 1}`;
    const sent = bridgeSafeError(new EngineError(words, { status: 422, code: "X" }));
    const api = load(() => Promise.reject(crossed("engine:getTags", sent)));

    const error = await (api.getTags as () => Promise<unknown>)().catch((e: unknown) => e);

    expect((error as Error).message).toBe(words);
    expect(fieldsOf(error).status).toBe(422);
  });

  it("is a plain Error with null fields when the rejection did not come from the engine", async () => {
    const api = load(() => Promise.reject(new Error("Error invoking remote method 'player:seek': TypeError: not a number")));

    const error = await (api.player.seek as (s: number) => Promise<unknown>)(1).catch((e: unknown) => e);

    expect((error as Error).message).toBe("not a number");
    expect(fieldsOf(error)).toEqual({ status: null, code: null, reportId: null });
  });

  it("reads a damaged tail as no fields, and keeps the words", async () => {
    const api = load(() =>
      Promise.reject(new Error(`Error invoking remote method 'x': Error: words${BRIDGE_ERROR_MARKER}{not json`)),
    );

    const error = await (api.getTags as () => Promise<unknown>)().catch((e: unknown) => e);

    expect((error as Error).message).toBe("words");
    expect(fieldsOf(error)).toEqual({ status: null, code: null, reportId: null });
  });

  it("leaves a rejection that was not wrapped by Electron as it was", async () => {
    const original = Object.assign(new Error("The engine is not connected."), { custom: 1 });
    const api = load(() => Promise.reject(original));

    await expect((api.getTags as () => Promise<unknown>)()).rejects.toBe(original);
  });

  describe("engineErrorFields, for where the page cannot see the properties", () => {
    // `contextBridge` rebuilds an Error in the page from its message alone, so the page asks
    // by message. In Electron 34 that was checked against the real bridge by
    // `e2e/reportErrors.spec.ts`.
    type FieldsOf = (message: string) => Fields | null;

    it("answers the fields of an engine error that crossed, by its words", async () => {
      const sent = bridgeSafeError(new EngineError("The library failed.", { status: 500, code: "LIBRARY_FAILED", reportId: "r9" }));
      const api = load(() => Promise.reject(crossed("engine:getTags", sent)));
      await (api.getTags as () => Promise<unknown>)().catch(() => undefined);

      expect((api.engineErrorFields as FieldsOf)("The library failed.")).toEqual({
        status: 500,
        code: "LIBRARY_FAILED",
        reportId: "r9",
      });
    });

    it("answers null for words it has not seen, and for an error that was not the engine's", async () => {
      const api = load(() => Promise.reject(new Error("Error invoking remote method 'x': Error: plain failure")));
      await (api.getTags as () => Promise<unknown>)().catch(() => undefined);

      expect((api.engineErrorFields as FieldsOf)("plain failure")).toBeNull();
      expect((api.engineErrorFields as FieldsOf)("never thrown")).toBeNull();
    });

    it("forgets an entry when the same words later arrive without fields", async () => {
      let engine = true;
      const api = load(() =>
        Promise.reject(
          engine
            ? crossed("c", bridgeSafeError(new EngineError("same words", { status: 500, code: "X", reportId: "r1" })))
            : new Error("Error invoking remote method 'c': Error: same words"),
        ),
      );
      await (api.getTags as () => Promise<unknown>)().catch(() => undefined);
      expect((api.engineErrorFields as FieldsOf)("same words")).not.toBeNull();

      engine = false;
      await (api.getTags as () => Promise<unknown>)().catch(() => undefined);

      expect((api.engineErrorFields as FieldsOf)("same words")).toBeNull();
    });

    it("remembers the newest 50 only", async () => {
      let n = 0;
      const api = load(() =>
        Promise.reject(crossed("c", bridgeSafeError(new EngineError(`failure ${n++}`, { status: 500, code: "X" })))),
      );
      for (let i = 0; i < 60; i++) await (api.getTags as () => Promise<unknown>)().catch(() => undefined);

      const fieldsOfWords = api.engineErrorFields as FieldsOf;
      expect(fieldsOfWords("failure 0")).toBeNull();
      expect(fieldsOfWords("failure 59")).not.toBeNull();
    });
  });
});

describe("the marker", () => {
  it("is the same in the preload as in main", () => {
    const quoted = `"${BRIDGE_ERROR_MARKER.replace("\u0000", "\\u0000")}"`;
    expect(source).toContain(`const ERROR_MARKER = ${quoted};`);
  });

  it("only wraps an EngineError; any other error is thrown as it was", () => {
    const plain = new TypeError("x");
    expect(bridgeSafeError(plain)).toBe(plain);
    const wrapped = bridgeSafeError(new EngineError("m", { status: 404, code: "NOT_FOUND" })) as Error;
    expect(wrapped).not.toBeInstanceOf(EngineError);
    expect(wrapped.message.startsWith(`m${BRIDGE_ERROR_MARKER}`)).toBe(true);
  });
});
