import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EngineSupervisor } from "./engineSupervisor";

/**
 * The maintenance stop and the one-off run a restore uses (HARDEN-01b): the stop is not a crash
 * and starts no restart, the one-off run gets the engine's own arguments and environment, and
 * a run that hangs is ended.
 */
vi.mock("./engineLaunch", () => ({
  shouldUseBundledEngine: () => false,
  getBundledEnginePath: () => "/nonexistent/engine/cuepoint-engine",
}));

const server = `
const http = require("http");
const args = process.argv.slice(2);
if (args.includes("--restore")) {
  if (args.includes("bad.db")) {
    console.error(JSON.stringify({ error_code: "BACKUP_CORRUPT", message: "damaged" }));
    process.exit(1);
  }
  if (args.includes("hang.db")) setInterval(() => {}, 1000);
  else {
    console.log(JSON.stringify({ safety_backup: "kept.db", home: process.env.CUEPOINT_HOME || null, headless: process.env.CUEPOINT_HEADLESS }));
    process.exit(0);
  }
} else {
  http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ version: "stand-in" }));
  }).listen(Number(process.env.CUEPOINT_PORT), "127.0.0.1");
}
`;

let dir: string;
let supervisors: EngineSupervisor[];
const changes: string[] = [];

function make(): EngineSupervisor {
  const file = path.join(dir, "standin.cjs");
  writeFileSync(file, server);
  const supervisor = new EngineSupervisor({
    restartBackoffMs: [5, 5, 5],
    healthTimeoutMs: 5000,
    command: () => ({ command: process.execPath, args: [file] }),
    onStatusChanged: () => changes.push(supervisor.getStatus().error ?? "ok"),
  });
  supervisors.push(supervisor);
  return supervisor;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cuepoint-maint-"));
  supervisors = [];
  changes.length = 0;
  process.env.CUEPOINT_HOME = dir;
});

afterEach(async () => {
  delete process.env.CUEPOINT_HOME;
  for (const s of supervisors) await s.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("stopForMaintenance", () => {
  it("stops the engine without a restart or a crash, says Restoring, and start() brings it back", async () => {
    const supervisor = make();
    expect((await supervisor.start()).connected).toBe(true);

    const token = await supervisor.stopForMaintenance();
    expect(supervisor.getStatus()).toMatchObject({ connected: false, error: "Restoring", reconnecting: false, restartAttempts: 0 });

    // Longer than the 5 ms backoff: a restart that was going to happen would have by now.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(supervisor.getStatus()).toMatchObject({ connected: false, error: "Restoring", restartAttempts: 0 });
    expect(changes).not.toContain("Reconnecting");

    expect((await supervisor.start(token)).connected).toBe(true);
    expect(supervisor.getStatus().error).toBeUndefined();
  });

  it("refuses start() and restart() without the token, and accepts restart() with it", async () => {
    const supervisor = make();
    await supervisor.start();
    const token = await supervisor.stopForMaintenance();

    expect((await supervisor.start()).connected).toBe(false);
    expect((await supervisor.restart()).connected).toBe(false);
    expect((await supervisor.start({ maintenance: true })).connected).toBe(false);
    expect(supervisor.getStatus()).toMatchObject({ connected: false, error: "Restoring" });

    expect((await supervisor.restart(token)).connected).toBe(true);
  });
});

describe("runOnce", () => {
  it("runs the engine with the extra arguments and its environment, and reports the exit", async () => {
    const supervisor = make();
    const run = await supervisor.runOnce(["--restore", "ok.db"], 10_000);

    expect(run).toMatchObject({ code: 0, timedOut: false });
    const said = JSON.parse(run.stdout.trim().split("\n").at(-1)!);
    expect(said).toEqual({ safety_backup: "kept.db", home: dir, headless: "1" });
  });

  it("hands back the failure line on stderr", async () => {
    const run = await make().runOnce(["--restore", "bad.db"], 10_000);
    expect(run.code).toBe(1);
    expect(JSON.parse(run.stderr.trim())).toEqual({ error_code: "BACKUP_CORRUPT", message: "damaged" });
  });

  it("ends a run that outlasts its time", async () => {
    const run = await make().runOnce(["--restore", "hang.db"], 300);
    expect(run.timedOut).toBe(true);
  });

  it("settles even when the killed process's pipes never close", async () => {
    // A grandchild keeps the pipes open after its parent is killed.
    const file = path.join(dir, "grand.cjs");
    writeFileSync(
      file,
      `require("child_process").spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "inherit", detached: true }).unref(); setInterval(()=>{},1000);`,
    );
    const supervisor = new EngineSupervisor({ command: () => ({ command: process.execPath, args: [file] }) });
    const run = await supervisor.runOnce([], 200);
    expect(run.timedOut).toBe(true);
  }, 15_000);

  it("answers rather than rejects when the program cannot be spawned", async () => {
    const supervisor = new EngineSupervisor({ command: () => ({ command: path.join(dir, "no-such-binary"), args: [] }) });
    const run = await supervisor.runOnce(["--restore", "x.db"], 5000);
    expect(run.code).toBeNull();
    expect(run.spawnError).toBeTruthy();
  });
});
