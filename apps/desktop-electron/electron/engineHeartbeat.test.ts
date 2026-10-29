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
