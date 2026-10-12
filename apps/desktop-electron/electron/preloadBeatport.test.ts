/**
 * The preload's Beatport sign-in methods (C12): each is one IPC call to main, and none of them
 * hands the page a token. The preload is run with a fake `electron`, as `preloadErrors.test.ts`
 * does.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "preload.cjs"), "utf-8");

type Api = Record<string, (...args: unknown[]) => unknown>;

function load(invoke: (channel: string, ...args: unknown[]) => Promise<unknown>) {
  let exposed: Api | null = null;
  const listeners = new Map<string, (event: unknown, payload: unknown) => void>();
  const removeListener = vi.fn();
  const electron = {
    contextBridge: { exposeInMainWorld: (_name: string, api: Api) => (exposed = api) },
    ipcRenderer: {
      invoke,
      on: (channel: string, handler: (event: unknown, payload: unknown) => void) => listeners.set(channel, handler),
      removeListener,
    },
    webUtils: { getPathForFile: () => "" },
  };
  new Function("require", source)((name: string) => {
    if (name !== "electron") throw new Error(`unexpected require ${name}`);
    return electron;
  });
  return { api: exposed!, listeners, removeListener };
}

const STATUS = { state: "signed_in", masked: "••••abcd", expires_at: null, secure_storage: true };

describe("the Beatport sign-in bridge", () => {
  it.each([
    ["beatportSignIn", "beatport:signIn", []],
    ["beatportSignOut", "beatport:signOut", []],
    ["getBeatportAuth", "beatport:getAuth", []],
    ["saveBeatportPastedToken", "beatport:savePastedToken", ["pasted-token"]],
  ] as const)("%s invokes %s and answers what main answers", async (method, channel, args) => {
    const invoke = vi.fn().mockResolvedValue(STATUS);
    const { api } = load(invoke);

    expect(typeof api[method]).toBe("function");
    await expect(api[method]!(...args)).resolves.toEqual(STATUS);
    expect(invoke).toHaveBeenCalledWith(channel, ...args);
  });

  it("subscribes to the status pushes and returns an unsubscribe", () => {
    const { api, listeners, removeListener } = load(vi.fn());
    const seen: unknown[] = [];

    const unsubscribe = api.onBeatportAuthChanged!((status: unknown) => seen.push(status)) as () => void;
    listeners.get("beatport:authChanged")!({}, STATUS);
    expect(seen).toEqual([STATUS]);

    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith("beatport:authChanged", listeners.get("beatport:authChanged"));
  });

  it("has no channel that returns a token: the four beatport: channels, and no more", () => {
    const channels = [...source.matchAll(/ipcRenderer\.invoke\(\s*"(beatport:[^"]+)"/g)].map((m) => m[1]);
    expect(channels.sort()).toEqual(["beatport:getAuth", "beatport:savePastedToken", "beatport:signIn", "beatport:signOut"]);
    expect(source).not.toMatch(/take-?legacy|beatport-session|getBeatportToken\b(?!Status)/i);
  });
});
