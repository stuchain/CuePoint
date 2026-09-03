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

  describe("library import and summary (LIBRARY-06)", () => {
    // Named the same way library search is, for the same reason: the generic
    // checks above only compare the files against each other, so a method
    // missing from *all* of them passes every one of them. These say what has
    // to exist.
    it("exposes both methods on the preload", () => {
      expect(invokedChannels(preload)).toContain("engine:startLibraryImport");
      expect(invokedChannels(preload)).toContain("engine:getLibrarySummary");
    });

    it("handles both channels in the main process", () => {
      expect(handledChannels(main)).toContain("engine:startLibraryImport");
      expect(handledChannels(main)).toContain("engine:getLibrarySummary");
    });

    it("has typed client methods hitting the documented paths", () => {
      // The open bracket matters. `toContain("async startLibraryImport")` also
      // matches `async startLibraryImportMisspelled(`, so renaming the method
      // passed this check — which is exactly the drift it exists to catch.
      expect(engineClient).toContain("async startLibraryImport(");
      expect(engineClient).toContain("/api/v1/library/import");
      expect(engineClient).toContain("async getLibrarySummary(");
      expect(engineClient).toContain("/api/v1/library/summary");
    });

    it("forwards both through the supervisor", () => {
      const declared = supervisorMethodsDeclared(supervisor);
      expect(declared).toContain("startLibraryImport");
      expect(declared).toContain("getLibrarySummary");
    });

    it("declares both on the renderer bridge type", () => {
      // With the `?:`, for the same substring reason as above.
      expect(bridgeTypes).toContain("startLibraryImport?:");
      expect(bridgeTypes).toContain("getLibrarySummary?:");
      expect(bridgeTypes).toContain("interface LibrarySummary");
      expect(bridgeTypes).toContain("interface LibraryImportStarted");
    });

    it("starts the import with POST, not a GET", () => {
      // A GET that changes the library would be retried by anything that
      // retries GETs, and would import twice.
      const method = engineClient.slice(
        engineClient.indexOf("async startLibraryImport"),
        engineClient.indexOf("async getLibrarySummary"),
      );
      expect(method).toContain('method: "POST"');
    });
  });

  describe("refresh preview and apply (LIBRARY-10)", () => {
    // Named the same way, for the same reason: the generic checks only compare
    // the files against each other, so a method missing from all of them passes
    // every one.
    it("exposes both methods on the preload", () => {
      expect(invokedChannels(preload)).toContain("engine:startLibraryRefreshPreview");
      expect(invokedChannels(preload)).toContain("engine:startLibraryRefreshApply");
    });

    it("handles both channels in the main process", () => {
      expect(handledChannels(main)).toContain("engine:startLibraryRefreshPreview");
      expect(handledChannels(main)).toContain("engine:startLibraryRefreshApply");
    });

    it("has typed client methods hitting the documented paths", () => {
      expect(engineClient).toContain("async startLibraryRefreshPreview(");
      expect(engineClient).toContain("/api/v1/library/refresh/preview");
      expect(engineClient).toContain("async startLibraryRefreshApply(");
      expect(engineClient).toContain("/api/v1/library/refresh/apply");
    });

    it("forwards both through the supervisor", () => {
      const declared = supervisorMethodsDeclared(supervisor);
      expect(declared).toContain("startLibraryRefreshPreview");
      expect(declared).toContain("startLibraryRefreshApply");
    });

    it("declares both on the renderer bridge type", () => {
      expect(bridgeTypes).toContain("startLibraryRefreshPreview?:");
      expect(bridgeTypes).toContain("startLibraryRefreshApply?:");
      expect(bridgeTypes).toContain("interface RefreshDiff");
      expect(bridgeTypes).toContain("interface RefreshApplied");
      expect(bridgeTypes).toContain("interface LibraryRefreshStarted");
    });

    it("posts both, and sends the diff id on the apply", () => {
      // A GET that applied a refresh would be retried by anything that retries
      // GETs, and DEC-003's deletions do not come back.
      const preview = engineClient.slice(
        engineClient.indexOf("async startLibraryRefreshPreview("),
        engineClient.indexOf("async startLibraryRefreshApply("),
      );
      const apply = engineClient.slice(
        engineClient.indexOf("async startLibraryRefreshApply("),
        engineClient.indexOf("async getLibrarySummary("),
      );
      expect(preview).toContain('method: "POST"');
      expect(apply).toContain('method: "POST"');
      expect(apply).toContain("diff_id");
    });

    it("carries a job result the renderer can read the diff from", () => {
      // The diff is served from the results route, not the polled status one.
      // A bridge type without `result` would type-check every consumer into
      // believing a preview job answers nothing.
      expect(bridgeTypes).toContain("result?: RefreshDiff | RefreshApplied");
    });
  });
});
