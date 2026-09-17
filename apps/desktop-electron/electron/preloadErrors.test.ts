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
