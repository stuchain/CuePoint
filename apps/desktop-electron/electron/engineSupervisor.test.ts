import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcessIncident, ProcessReporter } from "./processWatch";

/**
 * A slow engine start (ELECTRON-9), on fake timers.
 *
 * No process is started: `spawn` gives a stand-in child, `fetch` answers `/health` as the test says
 * and the clock is the test's. The first budget is 1000 ms and the whole wait 4000 ms here, the
 * same shape as 90 s and 5 min.
 */

class FakeChild extends EventEmitter {
  readonly pid: number;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exited = false;
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

const treeStops: number[] = [];
/** False: a tree that ignores the first stop and dies only when forced (the kill takes 2 s). */
let treeDies = true;
vi.mock("./processTree", () => ({
  stopProcessTree: (proc: FakeChild, options?: { force?: boolean }) => {
    treeStops.push(proc.pid);
    if (treeDies || options?.force === true) proc.finish();
  },
}));

vi.mock("./engineLaunch", () => ({
  shouldUseBundledEngine: () => false,
  getBundledEnginePath: () => "/nonexistent",
}));

import { EngineSupervisor, enginePhaseOf } from "./engineSupervisor";

const BUDGET = 1000;
const TOTAL = 4000;
const SLOW_POLL = 500;
/** Default restart backoff for the first automatic attempt, with a little over. */
const RESTART_WAIT = 1500;

/** What `/health` does now: answer, refuse the connection, or accept it and never answer. */
let health: "answer" | "refuse" | "hang" | "manual" | "error500" = "refuse";
/** The asks `manual` holds, to be answered by the test. */
const held: Array<(response: unknown) => void> = [];
let healthAsked = 0;

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      healthAsked += 1;
      if (health === "answer") {
        return Promise.resolve({ ok: true, json: async () => ({ version: "fake" }) });
      }
      if (health === "refuse") {
        return Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }));
      }
      if (health === "error500") return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      if (health === "manual") return new Promise((resolve) => held.push(resolve));
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    }),
  );
}

const incidents: ProcessIncident[] = [];
const crumbs: Array<{ message: string; data?: Record<string, unknown> }> = [];
const reporter: ProcessReporter = {
  incident: (incident) => incidents.push(incident),
  breadcrumb: (_category, message, data) => crumbs.push({ message, data }),
};

const supervisors: EngineSupervisor[] = [];
let started = 0;
function make(extra: Partial<ConstructorParameters<typeof EngineSupervisor>[0]> = {}): EngineSupervisor {
  const supervisor = new EngineSupervisor({
    command: () => ({ command: "fake-engine", args: [] }),
    healthTimeoutMs: BUDGET,
    slowStartTotalMs: TOTAL,
    slowHealthPollMs: SLOW_POLL,
    heartbeat: { intervalMs: 700, timeoutMs: 300, maxMisses: 3 },
    reporter,
    onStarted: () => {
      started += 1;
    },
    ...extra,
  });
  supervisors.push(supervisor);
  return supervisor;
}

const run = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const slow = () => incidents.filter((i) => i.outcome === "slow-start");
const failed = () => incidents.filter((i) => i.outcome === "start-failed");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  spawned.length = 0;
  treeStops.length = 0;
  incidents.length = 0;
  crumbs.length = 0;
  health = "refuse";
  healthAsked = 0;
  started = 0;
  treeDies = true;
  held.length = 0;
  stubFetch();
});

afterEach(async () => {
  health = "answer";
  treeDies = true;
  for (const supervisor of supervisors.splice(0)) await supervisor.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("enginePhaseOf", () => {
  it("reads a phase line and ignores other output", () => {
    expect(enginePhaseOf("cuepoint-engine: phase bound port=5000")).toBe("bound port=5000");
    expect(enginePhaseOf("  cuepoint-engine: phase imports-done  ")).toBe("imports-done");
    expect(enginePhaseOf("INFO something else")).toBeNull();
    expect(enginePhaseOf("")).toBeNull();
  });
});

describe("a slow engine start", () => {
  it("is marked healthy exactly like a normal start when it answers after the first budget", async () => {
    const supervisor = make();
    const start = supervisor.start();
    await run(BUDGET + 100);
    expect(supervisor.getStatus()).toMatchObject({ connected: false, starting: true, error: "Starting" });
    expect(started).toBe(0);

    health = "answer";
    await run(SLOW_POLL + 50);
    const status = await start;

    expect(status.connected).toBe(true);
    expect(supervisor.getStatus()).toMatchObject({ connected: true, version: "fake" });
    expect(started).toBe(1);
    expect(spawned).toHaveLength(1);
    expect(crumbs.some((c) => /^engine slow start \d+ s$/.test(c.message))).toBe(true);
    expect(failed()).toHaveLength(0);

    // The heartbeat is running: it asks /health again by itself.
    const asked = healthAsked;
    await run(1500);
    expect(healthAsked).toBeGreaterThan(asked);
  });

  it("holds a request made through readyClient and resolves it on the late answer", async () => {
    const supervisor = make();
    void supervisor.start();
    await run(BUDGET + 100);
    let settled: "pending" | "resolved" | "rejected" = "pending";
    const request = supervisor.getLibraryPlaylists().then(
      () => (settled = "resolved"),
      () => (settled = "rejected"),
    );
    await run(SLOW_POLL);
    expect(settled).toBe("pending");

    health = "answer";
    await run(SLOW_POLL + 50);
    await request;
    expect(settled).toBe("resolved");
  });

  it("fails a held request as engine-not-running after the hold, while the start goes on", async () => {
    const supervisor = make({ readyHoldMs: 300 });
    void supervisor.start();
    await run(BUDGET + 100);
    const request = supervisor.getLibraryPlaylists().catch((error: Error) => error);
    await run(400);
    const error = await request;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^Engine not running/);
    expect(supervisor.getStatus()).toMatchObject({ starting: true });
  });

  it("sends one warning, not an error, with the evidence", async () => {
    const supervisor = make();
    void supervisor.start();
    await run(50);
    spawned[0].stdout.write("cuepoint-engine: phase imports-done\n");
    await run(BUDGET + 500);
    // Stays quiet for the rest of the wait.
    await run(1500);

    expect(slow()).toHaveLength(1);
    const [warning] = slow();
    expect(warning.level).toBe("warning");
    expect(warning.process).toBe("engine");
    expect(warning.data).toMatchObject({
      child_alive: true,
      last_phase: "imports-done",
    });
    expect(warning.data.elapsed_ms).toBeGreaterThanOrEqual(BUDGET);
    expect(warning.data.health_attempts).toBeGreaterThan(0);
    expect(failed()).toHaveLength(0);
  });

  it("counts refused asks apart from asks that timed out", async () => {
    health = "refuse";
    const refusing = make();
    void refusing.start();
    await run(BUDGET + 100);
    const refused = slow()[0].data;
    expect(refused.health_refused).toBeGreaterThan(0);
    expect(refused.health_timed_out).toBe(0);
    expect(refused.health_attempts).toBe(refused.health_refused);
    await refusing.stop();

    incidents.length = 0;
    health = "hang";
    const hanging = make();
    void hanging.start();
    await run(BUDGET + 500);
    const hung = slow()[0].data;
    expect(hung.health_timed_out).toBeGreaterThan(0);
    expect(hung.health_refused).toBe(0);
    expect(hung.health_attempts).toBeGreaterThanOrEqual(hung.health_timed_out ?? 0);
    await hanging.stop();

    incidents.length = 0;
    health = "error500";
    const odd = make();
    void odd.start();
    await run(BUDGET + 500);
    const other = slow()[0].data;
    expect(other.health_other).toBeGreaterThan(0);
    expect(other.health_refused).toBe(0);
    expect(other.health_timed_out).toBe(0);
  });

  it("kills the process tree after the whole wait and tries once more, as Starting", async () => {
    const supervisor = make();
    const start = supervisor.start();
    await run(TOTAL + 100);

    expect(treeStops).toContain(1000);
    expect(spawned.length).toBeGreaterThanOrEqual(2);
    expect(supervisor.getStatus()).toMatchObject({ connected: false, starting: true, error: "Starting" });
    expect(failed()).toHaveLength(0);

    health = "answer";
    await run(SLOW_POLL + 50);
    await expect(start).resolves.toMatchObject({ connected: true });
    expect(spawned).toHaveLength(2);
    expect(started).toBe(1);
  });

  it("reports the error once and leaves the failed status when the second try fails too", async () => {
    const supervisor = make();
    const start = supervisor.start();
    await run(TOTAL * 2 + 1000);
    const status = await start;

    expect(status).toMatchObject({ connected: false });
    expect(spawned).toHaveLength(2);
    expect(treeStops).toEqual(expect.arrayContaining([1000, 1001]));
    expect(failed()).toHaveLength(1);
    expect(failed()[0].level).toBe("error");
    // The warning was told once, for the first try only.
    expect(slow()).toHaveLength(1);
    const after = supervisor.getStatus();
    expect(after.starting).toBeFalsy();
    expect(after.error).not.toBe("Starting");
    expect(after.connected).toBe(false);
  });

  it("sends the engine's stall dump with the start-failed report when the silent engine is given up on", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cp-stall-start-"));
    const file = path.join(dir, "engine-stall.txt");
    try {
      const supervisor = make({ stallFile: () => file });
      const start = supervisor.start();
      await run(TOTAL + 100); // the first try is killed; the second is under way (the launch cleared the file)
      expect(spawned).toHaveLength(2);
      const dump = "armed 2026-11-13T10:00:00+00:00\nTimeout (0:01:00)!\n\nThread 0x1 (most recent call first):\n";
      writeFileSync(file, dump);
      await run(TOTAL + 1000);
      await start;
      expect(failed()).toHaveLength(1);
      expect(failed()[0].extraAttachments).toEqual([{ filename: "engine-stall.txt", text: dump }]);
      expect(failed()[0].tags).toEqual({ stall_dump: "yes" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tags the start-failed report stall_dump=no when the silent engine left no dump", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cp-stall-start-"));
    try {
      const supervisor = make({ stallFile: () => path.join(dir, "engine-stall.txt") });
      const start = supervisor.start();
      await run(TOTAL * 2 + 1000);
      await start;
      expect(failed()).toHaveLength(1);
      expect(failed()[0].extraAttachments).toBeUndefined();
      expect(failed()[0].tags).toEqual({ stall_dump: "no" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps an exit during the extended wait an exit: reported, and no kill of its own", async () => {
    const supervisor = make();
    const start = supervisor.start();
    await run(BUDGET + 100);
    expect(slow()).toHaveLength(1);
    spawned[0].finish();
    await run(SLOW_POLL + 300);
    const status = await start;

    expect(status.connected).toBe(false);
    expect(treeStops).toEqual([]);
    // The exit was told as the engine's own (the incident opened, a restart follows).
    expect(crumbs.some((c) => /restart/i.test(c.message))).toBe(true);
    expect(failed()).toHaveLength(0);
  });

  it("keeps an early exit an exit: no slow-start warning, no extended wait", async () => {
    const supervisor = make();
    const start = supervisor.start();
    await run(100);
    spawned[0].finish();
    await run(200);
    const status = await start;

    expect(status.connected).toBe(false);
    expect(slow()).toHaveLength(0);
  });

  it("does not let a Restart during the retry's kill be undone by the stale launch", async () => {
    treeDies = false;
    const supervisor = make();
    const start = supervisor.start();
    await run(TOTAL + 300); // the silent engine is being killed (it ignores the first stop)
    expect(spawned).toHaveLength(1);
    health = "answer";
    const restart = supervisor.restart();
    await run(2500); // the kill's grace ends; the stale launch finds itself replaced
    await Promise.all([start, restart]);

    expect(spawned).toHaveLength(2);
    expect(spawned[1].exited).toBe(false);
    expect(supervisor.getStatus()).toMatchObject({ connected: true });
  });

  it("does not let stop() then start() during the retry's kill be undone either", async () => {
    treeDies = false;
    const supervisor = make();
    const first = supervisor.start();
    await run(TOTAL + 300);
    health = "answer";
    await supervisor.stop();
    const second = supervisor.start();
    await run(2500);
    await Promise.all([first, second]);

    expect(spawned).toHaveLength(2);
    expect(spawned[1].exited).toBe(false);
    expect(supervisor.getStatus()).toMatchObject({ connected: true });
  });

  it("names the phase of the current child only: a restarted child that prints nothing has none", async () => {
    const supervisor = make();
    void supervisor.start();
    await run(50);
    spawned[0].stdout.write("cuepoint-engine: phase bound port=1\n");
    await run(50);
    void supervisor.restart();
    await run(BUDGET + 500);

    expect(spawned).toHaveLength(2);
    expect(slow()).toHaveLength(1);
    expect(slow()[0].data.last_phase).toBeNull();
  });

  it("clears Starting when the retry launch rejects", async () => {
    const supervisor = make();
    const real = (supervisor as unknown as { pickPort: () => Promise<number> }).pickPort.bind(supervisor);
    let calls = 0;
    (supervisor as unknown as { pickPort: () => Promise<number> }).pickPort = () => {
      calls += 1;
      return calls === 1 ? real() : Promise.reject(new Error("no port"));
    };
    const start = supervisor.start().catch((error: Error) => error);
    await run(TOTAL + 300);
    expect(await start).toBeInstanceOf(Error);
    const status = supervisor.getStatus();
    expect(status.starting).toBeFalsy();
    expect(status.error).not.toBe("Starting");
  });

  it("does not mark a replaced launch's late answer healthy", async () => {
    health = "manual";
    const supervisor = make();
    void supervisor.start();
    await run(100);
    expect(held.length).toBeGreaterThan(0);
    const stale = held.splice(0);
    health = "hang";
    void supervisor.restart();
    await run(100);
    for (const answer of stale) answer({ ok: true, json: async () => ({ version: "stale" }) });
    await run(50);

    expect(supervisor.getStatus()).toMatchObject({ connected: false, starting: true });
    expect(started).toBe(0);
  });

  it("an automatic restart waits once, with no kill-and-retry of its own", async () => {
    const supervisor = make();
    health = "answer";
    await supervisor.start();
    // The engine dies by itself; its restart's engine then never answers.
    health = "refuse";
    spawned[0].finish();
    await run(RESTART_WAIT);
    // Past the whole extended wait of that restart: it is killed once, and nothing retries inside.
    await run(TOTAL + 500);
    expect(spawned).toHaveLength(2);
  });

  it("does nothing more once stop() has been asked for during the wait", async () => {
    const supervisor = make();
    const start = supervisor.start();
    await run(BUDGET + 100);
    await supervisor.stop();
    await run(TOTAL * 2);
    await start;

    expect(spawned).toHaveLength(1);
    expect(failed()).toHaveLength(0);
  });
});
