/**
 * Stopping a sidecar's whole process tree (CLEAN-14).
 */
import { describe, expect, it, vi } from "vitest";

import { descendantsOf, stopProcessTree, type RunSync } from "./processTree";

function proc(pid: number | undefined = 4242) {
  return { pid, kill: vi.fn(() => true) };
}

function runner(status: number | null = 0, error?: Error) {
  return vi.fn<RunSync>(() => ({ status, error }));
}

describe("stopProcessTree", () => {
  it("ends the whole tree on Windows, where the bootloader's child outlives it", () => {
    const child = proc();
    const run = runner();
    stopProcessTree(child, { platform: "win32", run });
    expect(run).toHaveBeenCalledWith("taskkill", ["/T", "/F", "/PID", "4242"]);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("falls back to killing the process when taskkill fails", () => {
    const child = proc();
    stopProcessTree(child, { platform: "win32", run: runner(128) });
    expect(child.kill).toHaveBeenCalledWith(undefined);

    const missing = proc();
    stopProcessTree(missing, { platform: "win32", run: runner(null, new Error("ENOENT")) });
    expect(missing.kill).toHaveBeenCalled();
  });

  it("kills a process with no pid without asking taskkill", () => {
    const child = { pid: undefined, kill: vi.fn(() => true) };
    const run = runner();
    stopProcessTree(child, { platform: "win32", run });
    expect(run).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalled();
  });

  it("signals the process elsewhere, as before, and forces on the second try", () => {
    const run = runner();
    const child = proc();
    stopProcessTree(child, { platform: "darwin", run });
    expect(child.kill).toHaveBeenLastCalledWith(undefined);
    stopProcessTree(child, { platform: "linux", run, force: true, processes: () => [] });
    expect(child.kill).toHaveBeenLastCalledWith("SIGKILL");
    expect(run).not.toHaveBeenCalled();
  });

  it("never throws for a process that is already gone", () => {
    const gone = { pid: 1, kill: vi.fn(() => { throw new Error("ESRCH"); }) };
    expect(() => stopProcessTree(gone, { platform: "linux" })).not.toThrow();
  });

  it("on a forced stop off Windows also kills what the process started, deepest first", () => {
    const killed: Array<[number, unknown]> = [];
    const spy = vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: unknown) => {
      killed.push([pid, signal]);
      return true;
    }) as typeof process.kill);
    try {
      const child = proc(100);
      // 100 is the bootloader, 101 the engine, 102 its worker; 7 is unrelated.
      stopProcessTree(child, { platform: "linux", force: true, processes: () => [[101, 100], [102, 101], [7, 1]] });
      expect(killed).toEqual([[102, "SIGKILL"], [101, "SIGKILL"]]);
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    } finally {
      spy.mockRestore();
    }
  });

  it("does not touch descendants on the polite first stop, which the bootloader forwards", () => {
    const spy = vi.spyOn(process, "kill").mockImplementation((() => true) as typeof process.kill);
    try {
      const processes = vi.fn(() => [[101, 100]] as Array<[number, number]>);
      stopProcessTree(proc(100), { platform: "linux", processes });
      expect(processes).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("descendantsOf", () => {
  it("finds children and their children, and ignores the rest and cycles", () => {
    expect(descendantsOf(1, [[2, 1], [3, 2], [4, 3], [9, 8], [1, 4]])).toEqual([2, 3, 4]);
    expect(descendantsOf(5, [])).toEqual([]);
  });
});
