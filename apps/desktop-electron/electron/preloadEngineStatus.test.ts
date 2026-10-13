/**
 * The preload's push of engine status changes: one listener on `engine:statusChanged`, handed
 * back as an unsubscribe. Run with a fake `electron`, as `preloadBeatport.test.ts` does.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "preload.cjs"), "utf-8");

describe("onEngineStatusChanged", () => {
  it("calls the listener on each push and unsubscribes", () => {
    let exposed: Record<string, (...args: unknown[]) => unknown> | null = null;
    const listeners = new Map<string, (event: unknown) => void>();
    const removeListener = vi.fn();
    const electron = {
      contextBridge: { exposeInMainWorld: (_n: string, api: typeof exposed) => (exposed = api) },
      ipcRenderer: {
        invoke: vi.fn(),
        on: (channel: string, handler: (event: unknown) => void) => listeners.set(channel, handler),
        removeListener,
      },
      webUtils: { getPathForFile: () => "" },
    };
    new Function("require", source)((name: string) => electron);

    const listener = vi.fn();
    const unsubscribe = exposed!.onEngineStatusChanged!(listener) as () => void;
    listeners.get("engine:statusChanged")!({});
    listeners.get("engine:statusChanged")!({});
    expect(listener).toHaveBeenCalledTimes(2);
    // The event object never reaches the page.
    expect(listener).toHaveBeenCalledWith();

    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith("engine:statusChanged", listeners.get("engine:statusChanged"));
  });
});
