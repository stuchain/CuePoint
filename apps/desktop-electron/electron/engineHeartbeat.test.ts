import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcessIncident, ProcessReporter } from "./processWatch";

/**
 * The engine's heartbeat (HARDEN-05, fact 5), on fake timers.
 *
 * No process is started and no port is answered: `spawn` gives a stand-in child, `fetch` answers
 * `/health` as the test says, and the clock is the test's. Real children and real HTTP are
 * `engineChildren.integration.test.ts`'s and the crash specs'.
 */

class FakeChild extends EventEmitter {
  readonly pid: number;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exited = false;
  killed: Array<boolean> = [];
  constructor(pid: number) {
    super();
    this.pid = pid;
  }
  kill(): boolean {
    this.finish();
    return true;
  }
  finish(): void {
    if (this.exited) return;
    this.exited = true;
    queueMicrotask(() => {
      this.emit("exit", null, "SIGKILL");
      this.emit("close", null, "SIGKILL");
    });
  }
}

const spawned: FakeChild[] = [];
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: vi.fn(() => {
    const child = new FakeChild(1000 + spawned.length);
    spawned.push(child);
    return child;
  }),
}));

const treeStops: Array<{ pid: number | undefined; force: boolean }> = [];
/** False: a tree that will not die, so the kill brings no exit. */
let treeDies = true;
const bodiesCancelled: number[] = [];
vi.mock("./processTree", () => ({
  stopProcessTree: (proc: FakeChild, options?: { force?: boolean }) => {
    treeStops.push({ pid: proc.pid, force: options?.force === true });
    if (treeDies) proc.finish();
  },
}));

vi.mock("./engineLaunch", () => ({
  shouldUseBundledEngine: () => false,
  getBundledEnginePath: () => "/nonexistent",
}));

import { EngineSupervisor } from "./engineSupervisor";

const HEARTBEAT = 15_000;
const TIMEOUT = 10_000;

/** What `/health` does for the fake engine now: answer, or never answer (until aborted). */
let health: "answer" | "hang" = "answer";
let healthAsked = 0;

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      healthAsked += 1;
      if (health === "answer") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ version: "fake" }),
          body: { cancel: async () => void bodiesCancelled.push(healthAsked) },
        });
      }
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }),
  );
}

const incidents: ProcessIncident[] = [];
const crumbs: string[] = [];
const reporter: ProcessReporter = {
  incident: (incident) => incidents.push(incident),
  breadcrumb: (_category, message) => crumbs.push(message),
};

const supervisors: EngineSupervisor[] = [];
function make(extra: ConstructorParameters<typeof EngineSupervisor>[0] = {}): EngineSupervisor {
  const supervisor = new EngineSupervisor({
    command: () => ({ command: "fake-engine", args: [] }),
    restartBackoffMs: [1000, 2000, 4000],
    healthTimeoutMs: 5000,
    reporter,
    ...extra,
  });
  supervisors.push(supervisor);
  return supervisor;
}

/** Let the clock run by `ms`, letting promises settle as it goes. */
const run = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  spawned.length = 0;
  treeStops.length = 0;
  incidents.length = 0;
  crumbs.length = 0;
  health = "answer";
  healthAsked = 0;
  treeDies = true;
  bodiesCancelled.length = 0;
  stubFetch();
});

afterEach(async () => {
  treeDies = true;
  for (const supervisor of supervisors.splice(0)) await supervisor.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the engine's heartbeat", () => {
  it("asks /health every 15 s while the engine is up, and an answered engine is left alone", async () => {
    const supervisor = make();
    await supervisor.start();
    const asked = healthAsked;
    await run(HEARTBEAT * 4 + 100);
    expect(healthAsked - asked).toBe(4);
    expect(spawned).toHaveLength(1);
    expect(supervisor.getStatus().connected).toBe(true);
  });

  it("restarts once after three misses in a row (45 s unanswered), killing the whole tree", async () => {
    const supervisor = make();
    await supervisor.start();
    health = "hang";

    // Two beats, each given 10 s: still not called dead.
    await run(HEARTBEAT + TIMEOUT + HEARTBEAT + TIMEOUT + 10);
    expect(spawned).toHaveLength(1);
    expect(treeStops).toEqual([]);

    // The third miss.
    await run(HEARTBEAT + TIMEOUT);
    expect(treeStops).toEqual([{ pid: 1000, force: true }]);
    expect(supervisor.getStatus()).toMatchObject({ connected: false, reconnecting: true, restartAttempts: 1 });

    // Back after the first backoff, answering.
    health = "answer";
    await run(1000 + 50);
    expect(spawned).toHaveLength(2);
    expect(supervisor.getStatus().connected).toBe(true);
  });

  it("does not restart after two misses and then an answer", async () => {
    const supervisor = make();
    await supervisor.start();

    health = "hang";
    await run(HEARTBEAT + TIMEOUT + HEARTBEAT + TIMEOUT + 10); // two misses
    health = "answer";
    await run(HEARTBEAT); // answered: the count starts again
    health = "hang";
    await run(HEARTBEAT + TIMEOUT + HEARTBEAT + TIMEOUT + 10); // two more misses
    health = "answer";
    await run(HEARTBEAT * 3);

    expect(treeStops).toEqual([]);
    expect(spawned).toHaveLength(1);
    expect(supervisor.getStatus()).toMatchObject({ connected: true, restartAttempts: 0 });
  });

  it("counts the restart toward the bound of three, then gives up", async () => {
    const supervisor = make();
    await supervisor.start();
    // Every engine from now on stops answering, so each restart fails its health wait.
    health = "hang";
    await run(HEARTBEAT * 3 + TIMEOUT * 3 + 10);
    expect(supervisor.getStatus().restartAttempts).toBe(1);

    // Each restart's health wait (5 s) fails; three attempts, with their backoffs, then it stops.
    await run(1000 + 5000 + 2000 + 5000 + 4000 + 5000 + 5000);
    expect(spawned).toHaveLength(4);
    expect(supervisor.getStatus()).toMatchObject({ connected: false, reconnecting: false, restartAttempts: 3 });
    expect(incidents.map((i) => i.outcome)).toEqual(["gave-up"]);
  });

  it("reports a stopped engine once per session: the second stop is a breadcrumb", async () => {
    const supervisor = make();
    await supervisor.start();

    health = "hang";
    await run(HEARTBEAT * 3 + TIMEOUT * 3 + 10);
    health = "answer";
    await run(1000 + 50); // restarted, answering: the incident's one event
    expect(incidents).toHaveLength(1);
    expect(incidents[0].data.signal).toBe("heartbeat");
    expect(incidents[0].data.restarts).toBe(1);

    health = "hang";
    await run(HEARTBEAT * 3 + TIMEOUT * 3 + 10);
    health = "answer";
    await run(1000 + 50);
    expect(spawned).toHaveLength(3);
    expect(incidents).toHaveLength(1);
    expect(crumbs).toContain("engine stopped answering");
  });

  it("is paused while the engine is stopped for maintenance (a restore), and while stopped", async () => {
    const supervisor = make();
    await supervisor.start();
    const token = await supervisor.stopForMaintenance();
    const asked = healthAsked;
    health = "hang";
    await run(HEARTBEAT * 10);
    expect(healthAsked).toBe(asked);
    expect(spawned).toHaveLength(1);
    expect(supervisor.getStatus()).toMatchObject({ error: "Restoring", reconnecting: false });

    // Started again by the restore's holder: asked again.
    health = "answer";
    await supervisor.start(token);
    expect(spawned).toHaveLength(2);
    await run(HEARTBEAT + 10);
    expect(healthAsked).toBeGreaterThan(asked);
  });

  it("tells the engine about an unclean exit and the test hooks, and nothing inherited decides them", async () => {
    const { engineEnvironment } = await import("./engineSupervisor");
    const base = { port: 1, token: "t", sessionId: "s", parentPid: 1, decoderPath: null, errorReporting: false };
    const inherited = { CUEPOINT_UNCLEAN_EXIT: "1", CUEPOINT_TEST_HOOKS: "1" };
    const plain = engineEnvironment({ ...base, env: inherited });
    expect(plain.CUEPOINT_UNCLEAN_EXIT).toBeUndefined();
    expect(plain.CUEPOINT_TEST_HOOKS).toBeUndefined();
    const told = engineEnvironment({ ...base, env: {}, uncleanExit: true, testHooks: true });
    expect(told.CUEPOINT_UNCLEAN_EXIT).toBe("1");
    expect(told.CUEPOINT_TEST_HOOKS).toBe("1");
  });

  it("starts the engine told about an unclean exit and the test hooks, not only a one-off run", async () => {
    const { spawn } = await import("node:child_process");
    const told = make({ uncleanExit: () => true, testHooks: () => true });
    await told.start();
    const env = vi.mocked(spawn).mock.calls.at(-1)![2]!.env!;
    expect(env.CUEPOINT_UNCLEAN_EXIT).toBe("1");
    expect(env.CUEPOINT_TEST_HOOKS).toBe("1");
    const plain = make();
    await plain.start();
    const bare = vi.mocked(spawn).mock.calls.at(-1)![2]!.env!;
    expect(bare.CUEPOINT_UNCLEAN_EXIT).toBeUndefined();
    expect(bare.CUEPOINT_TEST_HOOKS).toBeUndefined();
  });

  it("asks for the stall only in a run with the test hooks on", async () => {
    const off = make();
    await off.start();
    await expect(off.stallForTest()).rejects.toThrow(/test hooks/);
    const on = make({ testHooks: () => true });
    await on.start();
    vi.mocked(fetch).mockClear();
    await on.stallForTest();
    const [url, init] = vi.mocked(fetch).mock.calls[0]! as [string, { method: string; headers: Record<string, string> }];
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/v1\/test\/stall$/);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toMatch(/^Bearer [0-9a-f]{48}$/);
  });

  it("describes itself to a failed end-to-end call only in a run with the test hooks on, with no token", async () => {
    const off = make();
    await off.start();
    expect(() => off.diagnosticsForTest()).toThrow(/test hooks/);

    const on = make({ testHooks: () => true });
    await on.start();
    const first = on.diagnosticsForTest();
    expect(first).toMatchObject({
      healthy: true,
      spawned: 1,
      exits: 0,
      lastExit: null,
      heartbeatActive: true,
      heartbeatMisses: 0,
      restartAttempts: 0,
    });
    expect(first.pid).toBeGreaterThan(0);
    expect(first.port).toBeGreaterThan(0);
    expect(JSON.stringify(first)).not.toMatch(/[0-9a-f]{48}/);

    // An engine that exits on its own is counted, with how it ended, and a restart follows.
    spawned.at(-1)!.finish();
    await run(10);
    expect(on.diagnosticsForTest()).toMatchObject({
      healthy: false,
      exits: 1,
      lastExit: { code: null, signal: "SIGKILL" },
      reconnecting: true,
      restartAttempts: 1,
    });
    await run(1000 + 50);
    expect(on.diagnosticsForTest()).toMatchObject({ healthy: true, spawned: 2, exits: 1 });
  });

  it("lets go of the health answer's body", async () => {
    const supervisor = make();
    await supervisor.start();
    await run(HEARTBEAT + 10);
    expect(bodiesCancelled.length).toBeGreaterThanOrEqual(1);
  });

  it("restarts anyway when the killed engine's exit never comes", async () => {
    const supervisor = make();
    await supervisor.start();
    treeDies = false;
    health = "hang";
    await run(HEARTBEAT * 3 + TIMEOUT * 3 + 10);
    expect(treeStops).toHaveLength(1);
    // Nothing exited yet: not stuck as "up", not restarted either, until the grace is over.
    expect(spawned).toHaveLength(1);
    await run(5_000 + 10);
    expect(supervisor.getStatus()).toMatchObject({ connected: false, reconnecting: true, restartAttempts: 1 });
    health = "answer";
    await run(1000 + 50);
    expect(spawned).toHaveLength(2);
    expect(supervisor.getStatus().connected).toBe(true);
  });

  it("gives up after three heartbeat restarts within 10 minutes, and Restart engine brings it back", async () => {
    const supervisor = make();
    await supervisor.start();
    const stallAndRecover = async (): Promise<void> => {
      health = "hang";
      await run(HEARTBEAT * 3 + TIMEOUT * 3 + 10);
      health = "answer";
      await run(1000 + 50);
    };
    await stallAndRecover();
    await stallAndRecover();
    await stallAndRecover();
    expect(spawned).toHaveLength(4);
    expect(supervisor.getStatus().connected).toBe(true);

    // The fourth stop inside the window: no restart.
    health = "hang";
    await run(HEARTBEAT * 3 + TIMEOUT * 3 + 10);
    health = "answer";
    await run(60_000);
    expect(spawned).toHaveLength(4);
    expect(supervisor.getStatus()).toMatchObject({ connected: false, reconnecting: false, restartAttempts: 3 });

    // The manual restart still works and starts the count afresh.
    expect((await supervisor.restart()).connected).toBe(true);
    expect(spawned).toHaveLength(5);
  });

  it("does not give up when the stops are more than 10 minutes apart", async () => {
    const supervisor = make();
    await supervisor.start();
    for (let i = 0; i < 4; i += 1) {
      health = "hang";
      await run(HEARTBEAT * 3 + TIMEOUT * 3 + 10);
      health = "answer";
      await run(1000 + 50);
      await run(4 * 60_000);
    }
    expect(spawned).toHaveLength(5);
    expect(supervisor.getStatus().connected).toBe(true);
  });
});

describe("the engine's stall dump (ELECTRON-3)", () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "cp-stall-"));
    file = path.join(dir, "engine-stall.txt");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const DUMP =
    "armed 2026-11-13T10:00:00+00:00\nTimeout (0:01:00)!\n\nThread 0x00007f (most recent call first):\n" +
    '  File "/opt/CuePoint/engine/match_jobs.py", line 12 in run\n';

  const freeze = async (supervisor: EngineSupervisor): Promise<void> => {
    await supervisor.start();
    health = "hang";
    await run(HEARTBEAT * 3 + TIMEOUT * 3 + 10);
    health = "answer";
    await run(1000 + 50);
  };

  it("tells the engine where to write it, and removes what an earlier engine left", async () => {
    const { spawn } = await import("node:child_process");
    writeFileSync(file, DUMP);
    const supervisor = make({ stallFile: () => file });
    await supervisor.start();
    const env = vi.mocked(spawn).mock.calls.at(-1)![2]!.env!;
    expect(env.CUEPOINT_STALL_FILE).toBe(file);
    expect(env.CUEPOINT_STALL_TOKEN).toMatch(/^[0-9a-f]{32}$/);
    const { existsSync } = await import("node:fs");
    expect(existsSync(file)).toBe(false);
  });

  it("ignores a dump from another launch that shares the file", async () => {
    const supervisor = make({ stallFile: () => file });
    await supervisor.start();
    writeFileSync(file, "armed 2026-11-13T10:00:00+00:00 someoneelse\n" + DUMP.replace(/^armed[^\n]*\n/, ""));
    health = "hang";
    await run(HEARTBEAT * 3 + TIMEOUT * 3 + 10);
    health = "answer";
    await run(1000 + 50);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].tags).toEqual({ stall_dump: "no" });
    expect(incidents[0].extraAttachments).toBeUndefined();
  });

  it("goes with the incident when the heartbeat kills the engine, tagged stall_dump=yes", async () => {
    const supervisor = make({ stallFile: () => file });
    await supervisor.start();
    writeFileSync(file, DUMP); // what the frozen engine's watchdog wrote
    health = "hang";
    await run(HEARTBEAT * 3 + TIMEOUT * 3 + 10);
    health = "answer";
    await run(1000 + 50);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].attachment?.filename).toBe("engine-output.txt");
    expect(incidents[0].extraAttachments).toEqual([{ filename: "engine-stall.txt", text: DUMP }]);
    expect(incidents[0].tags).toEqual({ stall_dump: "yes" });
  });

  it("is tagged stall_dump=no, with no attachment, when the engine left no file", async () => {
    const supervisor = make({ stallFile: () => file });
    await freeze(supervisor);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].extraAttachments).toBeUndefined();
    expect(incidents[0].tags).toEqual({ stall_dump: "no" });
  });

  it("is tagged stall_dump=no when the file holds only the armed line", async () => {
    const supervisor = make({ stallFile: () => file });
    await supervisor.start();
    writeFileSync(file, "armed 2026-11-13T10:00:00+00:00\n");
    health = "hang";
    await run(HEARTBEAT * 3 + TIMEOUT * 3 + 10);
    health = "answer";
    await run(1000 + 50);
    expect(incidents[0].extraAttachments).toBeUndefined();
    expect(incidents[0].tags).toEqual({ stall_dump: "no" });
  });

  it("tags stall_dump no and attaches nothing when no file was configured", async () => {
    await freeze(make());
    expect(incidents).toHaveLength(1);
    expect(incidents[0].tags).toEqual({ stall_dump: "no" });
    expect(incidents[0].extraAttachments).toBeUndefined();
  });
});
