/**
 * The desktop contract does not drift.
 *
 * A feature that crosses the engine boundary has to move six files together:
 * the Python handler, `engineClient.ts`, **`engineSupervisor.ts`**, `main.ts`,
 * the runtime `preload.cjs` and these bridge types. Forgetting one is silent —
 * the renderer type-checks against a method nothing exposes, and it fails only
 * at runtime, in the packaged app, as `undefined is not a function`.
 *
 * The supervisor is the one that actually bit: `main.ts` calls `engine.X()` on
 * an `EngineSupervisor` facade, which forwards to `EngineClient` method by
 * method. Adding the client method and the IPC channel is not enough, and
 * nothing type-checks the gap because `main.ts` compiles against whatever the
 * supervisor happens to have.
 *
 * `preload.ts` is a placeholder and is deliberately not read here; `preload.cjs`
 * is what actually loads.
 */
import { describe, expect, it } from "vitest";

// Read as text through Vite rather than `node:fs`: the renderer deliberately
// has no Node types, because renderer code must not reach for Node APIs, and
// adding them for one test would remove the compiler's ability to say so.
import preload from "../../../electron/preload.cjs?raw";
import main from "../../../electron/main.ts?raw";
import engineClient from "../../../electron/engineClient.ts?raw";
import supervisor from "../../../electron/engineSupervisor.ts?raw";
import bridgeTypes from "./cuepointBridge.types.ts?raw";

/** Every channel the preload invokes. */
function invokedChannels(source: string): string[] {
  return [...source.matchAll(/ipcRenderer\.invoke\(\s*"([^"]+)"/g)].map((m) => m[1]!);
}

/** Every channel the main process handles. */
function handledChannels(source: string): string[] {
  return [...source.matchAll(/ipcMain\.handle\(\s*\n?\s*"([^"]+)"/g)].map((m) => m[1]!);
}

/** Every `engine.X(...)` call main.ts makes inside an ipcMain handler. */
function supervisorMethodsCalled(source: string): string[] {
  return [...source.matchAll(/=>\s*engine\.([A-Za-z0-9_]+)\(/g)].map((m) => m[1]!);
}

/** Every method the supervisor declares. */
function supervisorMethodsDeclared(source: string): string[] {
  return [...source.matchAll(/^\s{2}(?:async\s+)?([A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]!);
}

describe("desktop contract", () => {
  it("declares every supervisor method the main process calls", () => {
    // This is the failure that shipped past a passing type-check and only
    // appeared in the running app: "engine.searchLibrary is not a function".
    const declared = new Set(supervisorMethodsDeclared(supervisor));
    const missing = supervisorMethodsCalled(main).filter((name) => !declared.has(name));

    expect(missing).toEqual([]);
  });

  it("handles every channel the preload invokes", () => {
    const handled = new Set(handledChannels(main));
    const missing = invokedChannels(preload).filter((channel) => !handled.has(channel));

    expect(missing).toEqual([]);
  });

  it("exposes a preload method for every engine channel the main process handles", () => {
    const invoked = new Set(invokedChannels(preload));
    const unreachable = handledChannels(main)
      .filter((channel) => channel.startsWith("engine:"))
      .filter((channel) => !invoked.has(channel));

    expect(unreachable).toEqual([]);
  });

  describe("library search (SHELL-04)", () => {
    // Named explicitly rather than left to the generic checks above: this is
    // the first endpoint added after the contract rule was written down, and
    // it is the worked example for the ones SHELL-07 and SHELL-08 will add.
    it("is exposed by the preload", () => {
      expect(preload).toContain("searchLibrary");
      expect(invokedChannels(preload)).toContain("engine:searchLibrary");
    });

    it("is handled by the main process", () => {
      expect(handledChannels(main)).toContain("engine:searchLibrary");
    });

    it("has a typed client method", () => {
      expect(engineClient).toContain("async searchLibrary");
      expect(engineClient).toContain("/api/v1/library/search");
    });

    it("is forwarded by the supervisor", () => {
      expect(supervisorMethodsDeclared(supervisor)).toContain("searchLibrary");
    });

    it("is declared on the renderer bridge type", () => {
      expect(bridgeTypes).toContain("searchLibrary");
      expect(bridgeTypes).toContain("LibrarySearchResponse");
    });
  });
});
