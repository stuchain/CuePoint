import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BeatportSignInLog,
  SIGNIN_LOG_FILE,
  SIGNIN_LOG_MAX_BYTES,
  hostAndPath,
  introspectFields,
  sessionFields,
  type SignInLogFs,
} from "./beatportSignInLog";

/** An in-memory file system: path -> text. Directories are not modelled. */
function fakeFs(options: { failAppend?: boolean; failRename?: () => boolean } = {}) {
  const files = new Map<string, string>();
  const fs: SignInLogFs = {
    mkdir: async () => undefined,
    appendFile: async (file, text) => {
      if (options.failAppend) throw new Error("disk full");
      files.set(file, (files.get(file) ?? "") + text);
    },
    stat: async (file) => {
      const text = files.get(file);
      if (text === undefined) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return { size: Buffer.byteLength(text) };
    },
    rename: async (from, to) => {
      if (options.failRename?.()) throw new Error("EPERM");
      files.set(to, files.get(from) ?? "");
      files.delete(from);
    },
    rm: async (file) => {
      files.delete(file);
    },
  };
  return { fs, files };
}

const NOW = Date.parse("2026-10-13T09:00:00.000Z");

function make(overrides: Partial<ConstructorParameters<typeof BeatportSignInLog>[0]> = {}) {
  const { fs, files } = fakeFs();
  const log = new BeatportSignInLog({
    getLogsDir: async () => "/logs",
    fallbackDir: () => "/electron-logs",
    fs,
    now: () => NOW,
    ...overrides,
  });
  return { log, files };
}

/** Let the folder answer (a microtask) land, then wait for the writes. */
async function settle(log: BeatportSignInLog): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await log.flush();
}

const lines = (text: string | undefined) => (text ?? "").split("\n").filter((line) => line !== "");

describe("BeatportSignInLog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes one line per event: ISO time, event, key=value pairs", async () => {
    const { log, files } = make();
    log.log("introspect", { n: 1, status: 200, active: "missing", scope: "app:prostore user:dj" });
    await settle(log);
    expect(lines(files.get(`/logs/${SIGNIN_LOG_FILE}`))).toEqual([
      "2026-10-13T09:00:00.000Z  introspect  n=1 status=200 active=missing scope=app:prostore user:dj",
    ]);
  });

  it("writes yes/no for booleans and leaves out undefined and null", async () => {
    const { log, files } = make();
    log.log("session read", { token: true, anon: false, keys: undefined, why: null });
    await settle(log);
    expect(files.get(`/logs/${SIGNIN_LOG_FILE}`)).toContain("  session read  token=yes anon=no\n");
  });

  it("keeps a line to about 200 characters and ASCII", async () => {
    const { log, files } = make();
    log.log("introspect", { scope: "a".repeat(80), keys: "k".repeat(80), reason: "r".repeat(80), via: "v".repeat(80) });
    log.log("closed", { by: "person ☃" });
    await settle(log);
    const written = lines(files.get(`/logs/${SIGNIN_LOG_FILE}`));
    expect(written[0]!.length).toBeLessThanOrEqual(200);
    expect(written[1]).toContain("by=?");
    // eslint-disable-next-line no-control-regex
    expect(written.every((line) => /^[\x20-\x7e]*$/.test(line))).toBe(true);
  });

  it("only writes allow-listed keys, and drops the rest", async () => {
    const { log, files } = make();
    log.log("introspect", { status: 200, authorization: "Bearer abc", cookie: "sid=1", secret: "x" } as never);
    await settle(log);
    const text = files.get(`/logs/${SIGNIN_LOG_FILE}`)!;
    expect(text).toContain("status=200");
    expect(text).not.toMatch(/authorization|cookie|secret|Bearer|sid=/);
  });

  it("replaces a value that does not look like plain words with ?", async () => {
    const { log, files } = make();
    log.log("nav", { host: "www.beatport.com", path: "/a?code=1", scope: "x@y.com", reason: "eyJhbGciOi.payload.sig", via: "Bearer abc" });
    await settle(log);
    const text = files.get(`/logs/${SIGNIN_LOG_FILE}`)!;
    expect(text).toContain("host=www.beatport.com path=? scope=? reason=? via=?");
    expect(text).not.toMatch(/code=|@|eyJ|Bearer/);
  });

  it("allows only yes/no/true/false/missing for the flag keys", async () => {
    const { log, files } = make();
    log.log("session read", { token: "SECRET-MARKER-123", username: "dj-anna", user_id: "77", jwt: "yes", anon: "false" });
    await settle(log);
    const text = files.get(`/logs/${SIGNIN_LOG_FILE}`)!;
    expect(text).toContain("token=? username=? user_id=? jwt=yes anon=false");
    expect(text).not.toMatch(/SECRET|anna|77/);
  });

  it("keeps only host and path of a URL", () => {
    expect(hostAndPath("https://www.beatport.com/api/auth/callback/beatport?code=SECRET&state=abc#frag")).toEqual({
      host: "www.beatport.com",
      path: "/api/auth/callback/*",
    });
    expect(hostAndPath("http://127.0.0.1:5555/authorize?client_id=x")).toEqual({ host: "127.0.0.1:5555", path: "/authorize" });
    expect(hostAndPath("https://www.beatport.com/library/tracks/12345?x=1")).toEqual({ host: "www.beatport.com", path: "/library/tracks/*" });
    expect(hostAndPath("https://www.beatport.com/")).toEqual({ host: "www.beatport.com", path: "/" });
    expect(hostAndPath("not a url")).toEqual({ host: "?", path: "?" });
    expect(hostAndPath(undefined)).toEqual({ host: "?", path: "?" });
  });

  it("hides id-like path segments and cuts a long path, and the result passes the value filter", async () => {
    const id = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4";
    const parsed = hostAndPath(`https://www.beatport.com/user/98765/${id}/deep/er`);
    expect(parsed.path).toBe("/user/*/*/*");
    expect(hostAndPath("https://x.example/a/b").path).toBe("/a/b");
    // A long word with no digits is not an id.
    expect(hostAndPath(`https://x.example/${"a".repeat(30)}`).path).toBe(`/${"a".repeat(30)}`);
    const { log, files } = make();
    log.log("nav", { host: parsed.host, path: parsed.path });
    await settle(log);
    expect(files.get(`/logs/${SIGNIN_LOG_FILE}`)).toContain("path=/user/*/*/*");
  });

  it("regression: C20 keeps appending to the live file, and loses nothing, when the rotation's rename fails", async () => {
    let renames = 0;
    const { fs, files } = fakeFs({ failRename: () => (renames += 1) <= 2 });
    files.set("/logs/beatport-signin.1.log", "OLD-ROTATED\n");
    const log = new BeatportSignInLog({ getLogsDir: async () => "/logs", fallbackDir: () => "/x", fs, now: () => NOW, maxBytes: 300 });
    for (let i = 0; i < 12; i += 1) log.log("bearer seen", { n: i, len: 1234 });
    await settle(log);
    const current = files.get(`/logs/${SIGNIN_LOG_FILE}`)!;
    // Every line is there, and the old rotated log was not destroyed by the failed rename.
    for (let i = 0; i < 12; i += 1) expect(current).toContain(`n=${i} len=1234\n`);
    expect(files.get("/logs/beatport-signin.1.log")).toContain("OLD-ROTATED");
    // Rotation was not retried for every line: two failures, then it worked.
    expect(renames).toBeLessThanOrEqual(4);
  });

  it("rotates once to beatport-signin.1.log when the size limit is reached", async () => {
    const { log, files } = make({ maxBytes: 300 });
    for (let i = 0; i < 12; i += 1) log.log("bearer seen", { n: i, len: 1234 });
    await settle(log);
    const current = files.get(`/logs/${SIGNIN_LOG_FILE}`)!;
    const rotated = files.get("/logs/beatport-signin.1.log");
    expect(rotated).toBeDefined();
    expect(Buffer.byteLength(current)).toBeLessThanOrEqual(300);
    expect(Buffer.byteLength(rotated!)).toBeLessThanOrEqual(300);
    // Only one rotated file ever exists, and the newest line is in the current one.
    expect([...files.keys()].sort()).toEqual(["/logs/beatport-signin.1.log", `/logs/${SIGNIN_LOG_FILE}`]);
    expect(current).toMatch(/n=11 len=1234\n$/);
  });

  it("uses 256 KB as its default limit", () => {
    expect(SIGNIN_LOG_MAX_BYTES).toBe(256 * 1024);
  });

  it("buffers until the engine names the folder, then flushes in order", async () => {
    let answer: (dir: string) => void = () => undefined;
    const { log, files } = make({ getLogsDir: () => new Promise<string>((resolve) => (answer = resolve)) });
    log.log("start", { app: "1.0.0" });
    log.log("window", { mode: "visible" });
    await log.flush();
    expect(files.size).toBe(0);
    answer("/engine-logs");
    await vi.advanceTimersByTimeAsync(0);
    log.log("closed", { by: "person" });
    await log.flush();
    expect(lines(files.get(`/engine-logs/${SIGNIN_LOG_FILE}`)).map((line) => line.split("  ")[1])).toEqual(["start", "window", "closed"]);
  });

  it("falls back to the Electron logs folder after 30 s and says so in the first line", async () => {
    const { log, files } = make({ getLogsDir: () => new Promise<string>(() => undefined) });
    log.log("start", { app: "1.0.0" });
    await vi.advanceTimersByTimeAsync(29_999);
    await log.flush();
    expect(files.size).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await log.flush();
    const written = lines(files.get(`/electron-logs/${SIGNIN_LOG_FILE}`));
    expect(written[0]).toContain("  logs-folder  fallback=yes");
    expect(written[1]).toContain("  start  ");
  });

  it("regression: C20 a slow engine (12 s) still gets the lines, not the fallback folder", async () => {
    let answer: (dir: string) => void = () => undefined;
    const { log, files } = make({ getLogsDir: () => new Promise<string>((resolve) => (answer = resolve)) });
    log.log("start", {});
    await vi.advanceTimersByTimeAsync(12_000);
    expect(files.size).toBe(0);
    answer("/engine-logs");
    await vi.advanceTimersByTimeAsync(0);
    await log.flush();
    expect(files.has(`/engine-logs/${SIGNIN_LOG_FILE}`)).toBe(true);
    expect(files.has(`/electron-logs/${SIGNIN_LOG_FILE}`)).toBe(false);
  });

  it("regression: C20 after a fallback, switches to the engine's folder when it answers, with a note", async () => {
    let up = false;
    const { log, files } = make({
      getLogsDir: async () => {
        if (!up) throw new Error("engine starting");
        return "/engine-logs";
      },
    });
    log.log("start", {});
    await vi.advanceTimersByTimeAsync(30_000);
    await log.flush();
    expect(files.has(`/electron-logs/${SIGNIN_LOG_FILE}`)).toBe(true);
    log.log("during fallback", {});
    up = true;
    await vi.advanceTimersByTimeAsync(5_000);
    log.log("after", {});
    await log.flush();
    const moved = lines(files.get(`/engine-logs/${SIGNIN_LOG_FILE}`));
    expect(moved[0]).toContain("  logs-folder  fallback=earlier");
    expect(moved[1]).toContain("  after");
    expect(lines(files.get(`/electron-logs/${SIGNIN_LOG_FILE}`)).map((line) => line.split("  ")[1])).toEqual(["logs-folder", "start", "during fallback"]);
  });

  it("stops asking late after a bounded number of tries", async () => {
    let calls = 0;
    const { log } = make({
      getLogsDir: async () => {
        calls += 1;
        throw new Error("down");
      },
    });
    log.log("start", {});
    await vi.advanceTimersByTimeAsync(30_000 + 24 * 5_000 + 60_000);
    const settled = calls;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toBe(settled);
  });

  it("close() writes what is still buffered to the fallback folder and stops the timers", async () => {
    const { log, files } = make({ getLogsDir: () => new Promise<string>(() => undefined) });
    log.log("start", {});
    await log.close();
    expect(lines(files.get(`/electron-logs/${SIGNIN_LOG_FILE}`))[1]).toContain("  start");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("asks the engine again each second when it is not up yet, and falls back at 30 s", async () => {
    let calls = 0;
    const { log, files } = make({
      getLogsDir: async () => {
        calls += 1;
        if (calls < 3) throw new Error("engine starting");
        return "/engine-logs";
      },
    });
    log.log("start", {});
    await vi.advanceTimersByTimeAsync(0);
    expect(files.size).toBe(0);
    await vi.advanceTimersByTimeAsync(2_000);
    await log.flush();
    expect(files.has(`/engine-logs/${SIGNIN_LOG_FILE}`)).toBe(true);
    expect(files.has(`/electron-logs/${SIGNIN_LOG_FILE}`)).toBe(false);

    const down = make({
      getLogsDir: async () => {
        throw new Error("engine down");
      },
    });
    down.log.log("start", {});
    await vi.advanceTimersByTimeAsync(30_000);
    await down.log.flush();
    expect(down.files.has(`/electron-logs/${SIGNIN_LOG_FILE}`)).toBe(true);
  });

  it("keeps at most 200 buffered lines, the newest", async () => {
    let answer: (dir: string) => void = () => undefined;
    const { log, files } = make({ getLogsDir: () => new Promise<string>((resolve) => (answer = resolve)) });
    for (let i = 0; i < 250; i += 1) log.log("bearer seen", { n: i });
    answer("/logs");
    await vi.advanceTimersByTimeAsync(0);
    await log.flush();
    const written = lines(files.get(`/logs/${SIGNIN_LOG_FILE}`));
    expect(written).toHaveLength(200);
    expect(written[0]).toMatch(/n=50$/);
    expect(written[199]).toMatch(/n=249$/);
  });

  it("swallows a write error and keeps working", async () => {
    const { fs } = fakeFs({ failAppend: true });
    const log = new BeatportSignInLog({ getLogsDir: async () => "/logs", fallbackDir: () => "/x", fs, now: () => NOW });
    expect(() => log.log("start", {})).not.toThrow();
    await expect(log.flush()).resolves.toBeUndefined();
    expect(() => log.log("again", {})).not.toThrow();
    await expect(log.flush()).resolves.toBeUndefined();
  });
});

describe("sessionFields", () => {
  it("names the keys and scopes of a session, never a value that identifies anyone", () => {
    const fields = sessionFields({
      user: { email: "anna@example.com", name: "Anna" },
      expires: "2026-11-11T12:00:00.000Z",
      token: {
        accessToken: "SECRET-MARKER-token",
        scope: "app:prostore user:dj",
        anon: false,
        accessTokenExpires: 1_800_000_000_000,
      },
      introspect: { scope: "app:prostore user:anon", username: "anna", user_id: 77 },
    });
    expect(fields).toEqual({
      keys: "user|expires|token|introspect",
      token: "yes",
      token_scope: "app:prostore user:dj",
      anon: "false",
      expires: "yes",
      introspect_scope: "app:prostore user:anon",
    });
    expect(JSON.stringify(fields)).not.toMatch(/SECRET|anna|example|77/);
  });

  it("copes with an empty session, no token, and things that are not objects", () => {
    expect(sessionFields({})).toEqual({ keys: "none", token: "no", anon: "missing", expires: "no" });
    expect(sessionFields(null)).toEqual({ keys: "none", token: "no", anon: "missing", expires: "no" });
    expect(sessionFields([1])).toEqual({ keys: "none", token: "no", anon: "missing", expires: "no" });
    expect(sessionFields({ token: "x" })).toMatchObject({ token: "no" });
  });
});

describe("introspectFields", () => {
  it("says which keys are there and whether the person is named, never the values", () => {
    const fields = introspectFields({
      scope: "app:prostore user:dj",
      user_id: 123,
      username: "anna@example.com",
      exp: null,
      client_id: "SECRET-MARKER-client",
    });
    expect(fields).toEqual({
      keys: "scope|user_id|username|exp|client_id",
      active: "missing",
      scope: "app:prostore user:dj",
      username: "yes",
      user_id: "yes",
      exp: "null",
    });
    expect(JSON.stringify(fields)).not.toMatch(/SECRET|anna|example|123/);
  });

  it("reads active, a numeric exp, and an answer that is not an object", () => {
    expect(introspectFields({ active: true, exp: 1_800_000_000 })).toMatchObject({ active: "true", exp: "number", username: "no", user_id: "no" });
    expect(introspectFields({ active: false })).toMatchObject({ active: "false", exp: "missing" });
    expect(introspectFields("<html>")).toEqual({ keys: "none" });
  });
});
