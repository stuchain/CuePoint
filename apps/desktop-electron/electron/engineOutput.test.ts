import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EngineSupervisor, type EngineStatus } from "./engineSupervisor";
import type { ProcessIncident, ProcessReporter } from "./processWatch";

/**
 * The engine's pipes are drained, and its exits are reported once per incident (REPORT-05, DEC-028).
 *
 * The engine is a stand-in: a small Node script that behaves as told (`standinSource`), spawned
 * through the supervisor's `command` option, so these tests run the real spawn, the real pipes and
 * the real `/health` poll, and no Python. The reporter is a recorder.
 */

const launch = vi.hoisted(() => ({ bundled: false }));
vi.mock("./engineLaunch", () => ({
  shouldUseBundledEngine: () => launch.bundled,
  getBundledEnginePath: () => "/nonexistent/engine/cuepoint-engine",
}));

/** What the stand-in does, by its first argument. */
const standinSource = `
const http = require("http");
const fs = require("fs");
const [, , mode, marker] = process.argv;
const serve = () =>
  http
    .createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ version: "stand-in" }));
    })
    .listen(Number(process.env.CUEPOINT_PORT), "127.0.0.1");
// Every launch leaves a line in the marker file, so a test can count the launches.
const launches = () => (marker && fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").split("\\n").length - 1 : 0);
const leave = (code) => process.stderr.write("", () => process.stdout.write("", () => process.exit(code)));

const n = launches();
if (marker && mode !== "exit3-once") fs.appendFileSync(marker, "x\\n");

if (mode === "seq") {
  // The first launch exits, the second is slow to answer, every later one answers at once.
  if (n === 0) leave(3);
  else if (n === 1) setTimeout(serve, 600);
  else serve();
} else if (mode === "longline") {
  process.stdout.write("q".repeat(5000) + "\\n", serve);
} else if (mode === "flood") {
  // One megabyte on stdout, far more than a pipe holds, before the engine can answer.
  const line = "x".repeat(1023) + "\\n";
  let chunk = "";
  for (let i = 0; i < 1024; i++) chunk += i === 1023 ? "END-OF-FLOOD\\n" : line;
  process.stdout.write(chunk, serve);
} else if (mode === "serve") {
  console.log("engine up");
  serve();
} else if (mode === "exit3" || (mode === "exit3-once" && !fs.existsSync(marker))) {
  if (marker && mode === "exit3-once") fs.writeFileSync(marker, "x");
  console.log("loading /Users/anna/Music/x.flac");
  process.stderr.write("Traceback: boom\\n");
  leave(3);
} else if (mode === "exit3-once") {
  serve();
} else if (mode === "hang") {
  setInterval(() => undefined, 1000);
}
`;

let dir: string;
let script: string;
let supervisors: EngineSupervisor[];
let incidents: ProcessIncident[];
let crumbs: Array<{ category: string; message: string; data?: Record<string, unknown> }>;
let tokens: string[];

/** A reporter that writes to this test's arrays, so a supervisor left running cannot add to the next test's. */
function recorder(): ProcessReporter {
  const mine = { incidents, crumbs, tokens };
  return {
    breadcrumb: (category, message, data) => mine.crumbs.push({ category, message, data }),
    incident: (incident) => mine.incidents.push(incident),
    addToken: (token) => mine.tokens.push(token),
  };
}

function engine(
  mode: string,
  extra: { marker?: string; healthTimeoutMs?: number; backoffMs?: number } = {},
): EngineSupervisor {
  const supervisor = new EngineSupervisor({
    reporter: recorder(),
    restartBackoffMs: [extra.backoffMs ?? 5, extra.backoffMs ?? 5, extra.backoffMs ?? 5],
    healthTimeoutMs: extra.healthTimeoutMs,
    command: () => ({ command: process.execPath, args: [script, mode, ...(extra.marker ? [extra.marker] : [])] }),
  });
  supervisors.push(supervisor);
  return supervisor;
}

async function until(condition: () => boolean, ms = 8000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** How many times the stand-in has been launched, from its marker file. */
const launched = (marker: string) =>
  existsSync(marker) ? readFileSync(marker, "utf8").split("\n").length - 1 : 0;

const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
const named = (message: string) => crumbs.filter((c) => c.message === message);

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cuepoint-engine-standin-"));
  script = path.join(dir, "standin.cjs");
  writeFileSync(script, standinSource);
  supervisors = [];
  incidents = [];
  crumbs = [];
  tokens = [];
  launch.bundled = false;
});

afterEach(async () => {
  for (const supervisor of supervisors) await supervisor.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("the engine's pipes are drained", () => {
  it("an engine that writes a megabyte to stdout before answering stays healthy", async () => {
    const supervisor = engine("flood");
    const status: EngineStatus = await supervisor.start();

    expect(status.connected).toBe(true);
    const { stdout, stderr } = supervisor.recentOutput();
    // A tail, not a transcript: the last 50 lines, the newest last.
    expect(stdout).toHaveLength(50);
    expect(stdout.at(-1)).toBe("END-OF-FLOOD");
    expect(stderr).toEqual([]);
  }, 20_000);

  it("keeps stdout and stderr apart", async () => {
    const supervisor = engine("exit3");
    await supervisor.start();
    await until(() => incidents.length > 0);
    const { stdout, stderr } = supervisor.recentOutput();
    expect(stdout).toContain("loading /Users/anna/Music/x.flac");
    expect(stderr).toContain("Traceback: boom");
  });
});

describe("an exit that was not asked for", () => {
  it("that a restart recovers from is one event, with its code, restart count and output tail", async () => {
    const supervisor = engine("exit3-once", { marker: path.join(dir, "marker") });
    await supervisor.start();
    await until(() => incidents.length > 0);
    await settle();

    expect(incidents).toHaveLength(1);
    const [incident] = incidents;
    expect(incident!.process).toBe("engine");
    expect(incident!.outcome).toBe("recovered");
    expect(incident!.message).toBe("engine exited unexpectedly");
    expect(incident!.data).toMatchObject({ exit_code: 3, signal: null, restarts: 1, exits: 1 });
    expect(typeof incident!.data.uptime_ms).toBe("number");
    expect(incident!.attachment?.filename).toBe("engine-output.txt");
    expect(incident!.attachment?.text).toContain("Traceback: boom");
    expect(incident!.attachment?.text).toContain("loading /Users/anna/Music/x.flac");

    expect(named("engine exited unexpectedly")).toHaveLength(1);
    expect(named("engine restarting")).toHaveLength(1);
    expect(supervisor.getStatus().connected).toBe(true);
  });

  it("three restarts and a give-up are one event and a trail of breadcrumbs", async () => {
    const supervisor = engine("exit3");
    await supervisor.start();
    await until(() => incidents.length > 0);
    await settle(300);

    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outcome).toBe("gave-up");
    expect(incidents[0]!.data).toMatchObject({ exit_code: 3, restarts: 3, exits: 4 });
    expect(incidents[0]!.data.reason).toMatch(/3 restarts/);
    expect(incidents[0]!.attachment?.text).toContain("Traceback: boom");
    // The first exit and each of the three restarts' exits; the three restarts themselves.
    expect(named("engine exited unexpectedly")).toHaveLength(4);
    expect(named("engine restarting")).toHaveLength(3);
    expect(supervisor.getStatus()).toMatchObject({ connected: false, reconnecting: false });
  });

  it("a second crash after a recovery is a second incident", async () => {
    const supervisor = engine("exit3-once", { marker: path.join(dir, "marker") });
    await supervisor.start();
    await until(() => incidents.length === 1);
    // Kill the healthy engine from outside: not asked for by the supervisor.
    (supervisor as unknown as { child: { kill(): void } }).child.kill();
    await until(() => incidents.length === 2);
    expect(incidents.map((i) => i.outcome)).toEqual(["recovered", "recovered"]);
    expect(incidents[1]!.data.signal).toBe("SIGTERM");
  });
});

describe("a stop and a Restart that cut across an automatic restart", () => {
  it("stop() during the backoff cancels the restart: nothing is spawned and nothing is reported", async () => {
    const marker = path.join(dir, "launches");
    const supervisor = engine("exit3", { marker, backoffMs: 300 });
    await supervisor.start();
    await until(() => named("engine restarting").length === 1);
    expect(launched(marker)).toBe(1);

    await supervisor.stop();
    await settle(600);

    expect(launched(marker)).toBe(1);
    expect(incidents).toEqual([]);
    expect(supervisor.getStatus().connected).toBe(false);
    expect(supervisor.getStatus().reconnecting).toBe(false);
  });

  it("stop() during a launch that is still starting leaves no engine behind", async () => {
    const marker = path.join(dir, "launches");
    const supervisor = engine("hang", { marker });
    const starting = supervisor.start();
    await until(() => launched(marker) === 1);
    await supervisor.stop();
    const status = await starting;

    expect(status.connected).toBe(false);
    expect(supervisor.getStatus().error).toBe("Engine not running");
    expect(incidents).toEqual([]);
  });

  it("the user's Restart while an automatic restart is starting is not undone by it", async () => {
    // Launch 1 exits; launch 2 (automatic) is slow to answer; the user restarts meanwhile (launch 3).
    // The automatic restart's launch is superseded, and must not go on to start a fourth.
    const marker = path.join(dir, "launches");
    const supervisor = engine("seq", { marker });
    await supervisor.start();
    await until(() => launched(marker) === 2);

    const status = await supervisor.restart();
    await settle(900);

    expect(status.connected).toBe(true);
    expect(launched(marker)).toBe(3);
    expect(supervisor.getStatus()).toMatchObject({ connected: true, reconnecting: false });
    // Not the user's Restart's doing: the exit that began the incident ended it, once.
    expect(incidents.filter((i) => i.outcome === "gave-up")).toEqual([]);
    expect(incidents.length).toBeLessThanOrEqual(1);
  });

  it("an automatic restart that is waiting is not run after the user's Restart", async () => {
    const marker = path.join(dir, "launches");
    const supervisor = engine("seq", { marker, backoffMs: 400 });
    await supervisor.start();
    await until(() => named("engine restarting").length === 1);

    const status = await supervisor.restart();
    await settle(700);

    expect(status.connected).toBe(true);
    // The first launch and the user's: the waiting restart woke, saw it was stale and did nothing.
    expect(launched(marker)).toBe(2);
  });
});

describe("a runaway line", () => {
  it("is kept to a cap with a marker", async () => {
    const supervisor = engine("longline");
    await supervisor.start();
    const { stdout } = supervisor.recentOutput();
    expect(stdout).toHaveLength(1);
    expect(stdout[0]!.length).toBeLessThan(2100);
    expect(stdout[0]!.endsWith("...[truncated]")).toBe(true);
  });
});

describe("what is ours is not reported", () => {
  it("a deliberate stop", async () => {
    const supervisor = engine("serve");
    await supervisor.start();
    await supervisor.stop();
    await settle();
    expect(incidents).toEqual([]);
    expect(named("engine exited unexpectedly")).toEqual([]);
  });

  it("the user's Restart", async () => {
    const supervisor = engine("serve");
    await supervisor.start();
    const status = await supervisor.restart();
    await settle();
    expect(status.connected).toBe(true);
    expect(incidents).toEqual([]);
    expect(crumbs.filter((c) => c.category === "process")).toEqual([]);
  });
});

describe("a launch that fails without exiting", () => {
  it("a health check that times out is one event, once per launch of the app", async () => {
    const supervisor = engine("hang", { healthTimeoutMs: 300 });
    const first = await supervisor.start();
    expect(first.connected).toBe(false);
    await supervisor.restart();

    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outcome).toBe("start-failed");
    expect(incidents[0]!.message).toBe("engine did not answer its health check");
    expect(incidents[0]!.data.exits).toBe(0);
  });

  it("a bundled engine that is missing is one event, and the start still resolves", async () => {
    launch.bundled = true;
    // No stand-in `command`: the bundled path is the one under test.
    const supervisor = new EngineSupervisor({ reporter: recorder() });
    const status = await supervisor.start();

    expect(status.connected).toBe(false);
    expect(status.error).toMatch(/Bundled engine not found/);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outcome).toBe("start-failed");
    expect(incidents[0]!.message).toBe("bundled engine not found");
    // The path is the user's install: it stays out of the data, and is scrubbed if it is in the text.
    expect(JSON.stringify(incidents[0]!.data)).not.toContain("/nonexistent");
  });
});

describe("an engine that cannot be spawned", () => {
  it("is one event with the reason in its tail, and not an uncaught exception", async () => {
    const supervisor = new EngineSupervisor({
      reporter: recorder(),
      command: () => ({ command: path.join(dir, "no-such-engine"), args: [] }),
    });
    supervisors.push(supervisor);
    const status = await supervisor.start();

    expect(status.connected).toBe(false);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.message).toBe("engine could not be started");
    expect(incidents[0]!.attachment?.text).toMatch(/ENOENT/);
  });
});

describe("the engine's token", () => {
  it("is given to the reporter when it is made, so the scrubber can remove it", async () => {
    const supervisor = engine("serve");
    await supervisor.start();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatch(/^[0-9a-f]{48}$/);
    await supervisor.restart();
    expect(tokens).toHaveLength(2);
    expect(tokens[1]).not.toBe(tokens[0]);
  });
});
