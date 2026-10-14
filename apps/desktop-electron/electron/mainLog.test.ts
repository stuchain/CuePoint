import { describe, expect, it, vi } from "vitest";

import { createMainLog, type MainLogFs } from "./mainLog";

/**
 * Paths as keys, spelled with forward slashes: on Windows the code joins with
 * backslashes ("\\l\\main.log"), and the tests name files the POSIX way.
 */
class PathMap extends Map<string, string> {
  private static key(file: string): string {
    return file.replace(/\\/g, "/");
  }
  override get(file: string) {
    return super.get(PathMap.key(file));
  }
  override set(file: string, text: string) {
    return super.set(PathMap.key(file), text);
  }
  override has(file: string) {
    return super.has(PathMap.key(file));
  }
  override delete(file: string) {
    return super.delete(PathMap.key(file));
  }
}

function memoryFs(options: { failAppend?: boolean; lockMain?: boolean } = {}) {
  const files = new PathMap();
  const fs: MainLogFs = {
    mkdir: async () => undefined,
    appendFile: async (file, data) => {
      if (options.failAppend) throw new Error("disk full");
      files.set(file, (files.get(file) ?? "") + data);
    },
    stat: async (file) => {
      if (!files.has(file)) throw new Error("ENOENT");
      return { size: Buffer.byteLength(files.get(file)!) };
    },
    rename: async (from, to) => {
      if (options.lockMain && from.replace(/\\/g, "/").endsWith("/main.log")) throw new Error("EBUSY");
      if (!files.has(from)) throw new Error("ENOENT");
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    rm: async (file) => {
      files.delete(file);
    },
  };
  return { files, fs };
}

const fixedNow = () => new Date("2026-10-13T08:30:00.000Z");

describe("createMainLog", () => {
  it("writes one ASCII line per call with level, area and fields", async () => {
    const { files, fs } = memoryFs();
    const log = createMainLog({ resolveDir: async () => "/logs", fallbackDir: "/fallback", now: fixedNow, fs });
    log.info("app", "started", { version: "1.0.0", platform: "win32" });
    log.warn("bridge", "slow \u00e9", { status: "200" });
    await log.flush();
    expect(files.get("/logs/main.log")).toBe(
      "2026-10-13T08:30:00.000Z  INFO  [app] started version=1.0.0 platform=win32\n" +
        "2026-10-13T08:30:00.000Z  WARN  [bridge] slow ? status=200\n",
    );
  });

  it("writes a value outside the safe set as ? and caps a line at 300 characters", async () => {
    const { files, fs } = memoryFs();
    const log = createMainLog({ resolveDir: async () => "/logs", fallbackDir: "/f", now: fixedNow, fs });
    log.info("app", "x", { path: "C:\\Users\\me\\a.mp3", q: "a?b=c#d", ok: "a b" });
    log.info("Bad Area", "y".repeat(500));
    await log.flush();
    const [first, second] = files.get("/logs/main.log")!.split("\n");
    expect(first).toContain("path=?");
    expect(first).toContain("q=?");
    expect(first).toContain("ok=a_b");
    expect(second!.length).toBe(300);
    expect(second).toContain("[?]");
  });

  it("buffers until the folder is known, then writes in order", async () => {
    const { files, fs } = memoryFs();
    let resolve!: (dir: string) => void;
    const log = createMainLog({
      resolveDir: () => new Promise<string>((r) => (resolve = r)),
      fallbackDir: "/f",
      now: fixedNow,
      fs,
    });
    log.info("app", "one");
    log.info("app", "two");
    expect(files.size).toBe(0);
    resolve("/engine-logs");
    await log.flush();
    log.info("app", "three");
    await log.flush();
    const lines = files.get("/engine-logs/main.log")!.trim().split("\n");
    expect(lines.map((l) => l.split("] ")[1])).toEqual(["one", "two", "three"]);
  });

  it("keeps only the newest 200 buffered lines", async () => {
    const { files, fs } = memoryFs();
    let resolve!: (dir: string) => void;
    const log = createMainLog({ resolveDir: () => new Promise<string>((r) => (resolve = r)), fallbackDir: "/f", now: fixedNow, fs });
    for (let i = 0; i < 250; i++) log.info("app", `n${i}`);
    resolve("/l");
    await log.flush();
    const lines = files.get("/l/main.log")!.trim().split("\n");
    expect(lines).toHaveLength(200);
    expect(lines[0]).toContain("n50");
  });

  it("falls back after the timeout and says so on its first line", async () => {
    vi.useFakeTimers();
    try {
      const { files, fs } = memoryFs();
      const log = createMainLog({
        resolveDir: () => new Promise<string>(() => undefined),
        fallbackDir: "/fallback",
        resolveTimeoutMs: 5000,
        now: fixedNow,
        fs,
      });
      log.info("app", "started");
      const flushed = log.flush();
      await vi.advanceTimersByTimeAsync(5000);
      await flushed;
      const lines = files.get("/fallback/main.log")!.trim().split("\n");
      expect(lines[0]).toContain("[log] engine logs folder unknown, writing here");
      expect(lines[1]).toContain("[app] started");
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back at once when the folder cannot be resolved", async () => {
    const { files, fs } = memoryFs();
    const log = createMainLog({ resolveDir: async () => { throw new Error("no engine"); }, fallbackDir: "/fb", now: fixedNow, fs });
    log.info("app", "started");
    await log.flush();
    expect(files.get("/fb/main.log")).toContain("engine logs folder unknown");
  });

  it("rotates at the size limit and keeps three files", async () => {
    const { files, fs } = memoryFs();
    const log = createMainLog({ resolveDir: async () => "/l", fallbackDir: "/f", maxBytes: 200, keep: 3, now: fixedNow, fs });
    for (let i = 0; i < 12; i++) log.info("app", `line ${i} ${"x".repeat(40)}`);
    await log.flush();
    expect([...files.keys()].sort()).toEqual(["/l/main.1.log", "/l/main.2.log", "/l/main.log"]);
    for (const text of files.values()) expect(Buffer.byteLength(text)).toBeLessThanOrEqual(200);
    expect(files.get("/l/main.log")).toContain("line 11");
    expect(files.get("/l/main.2.log")).not.toContain("line 11");
  });

  it("swallows a write error", async () => {
    const { fs } = memoryFs({ failAppend: true });
    const log = createMainLog({ resolveDir: async () => "/l", fallbackDir: "/f", now: fixedNow, fs });
    expect(() => log.info("app", "x")).not.toThrow();
    await expect(log.flush()).resolves.toBeUndefined();
    log.info("app", "y");
    await expect(log.flush()).resolves.toBeUndefined();
  });
  it("moves to the engine's folder when it answers after the wait", async () => {
    vi.useFakeTimers();
    try {
      const { files, fs } = memoryFs();
      let answer!: (dir: string) => void;
      const log = createMainLog({
        resolveDir: () => new Promise<string>((r) => (answer = r)),
        fallbackDir: "/fallback",
        resolveTimeoutMs: 1000,
        now: fixedNow,
        fs,
      });
      log.info("app", "early");
      await vi.advanceTimersByTimeAsync(1000);
      answer("/engine-logs");
      await vi.advanceTimersByTimeAsync(0);
      log.info("app", "late");
      await log.flush();
      expect(files.get("/fallback/main.log")).toContain("[app] early");
      const moved = files.get("/engine-logs/main.log")!;
      expect(moved).toContain("engine logs folder known late");
      expect(moved).toContain("[app] late");
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits 30 s for the engine's folder by default", async () => {
    vi.useFakeTimers();
    try {
      const { files, fs } = memoryFs();
      const log = createMainLog({ resolveDir: () => new Promise<string>(() => undefined), fallbackDir: "/fb", now: fixedNow, fs });
      log.info("app", "x");
      await vi.advanceTimersByTimeAsync(29_000);
      expect(files.size).toBe(0);
      await vi.advanceTimersByTimeAsync(1_000);
      await log.flush();
      expect(files.get("/fb/main.log")).toContain("[app] x");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps writing and loses no older file when the current one is held open", async () => {
    const { files, fs } = memoryFs({ lockMain: true });
    files.set("/l/main.1.log", "older\n");
    const log = createMainLog({ resolveDir: async () => "/l", fallbackDir: "/f", maxBytes: 200, keep: 3, now: fixedNow, fs });
    for (let i = 0; i < 8; i++) log.info("app", `line ${i} ${"x".repeat(40)}`);
    await log.flush();
    expect(files.get("/l/main.1.log")).toBe("older\n");
    expect(files.has("/l/main.2.log")).toBe(false);
    expect(files.get("/l/main.log")).toContain("line 7");
  });
});
