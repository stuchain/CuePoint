import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EngineSupervisor } from "./engineSupervisor";

/**
 * `onStarted` is called after every successful health wait (C12): the first start, the person's
 * Restart, and an automatic restart after a crash. Main uses it to hand the Beatport token to an
 * engine that keeps it only in memory. The engine is a small Node stand-in, as in
 * `engineOutput.test.ts`.
 */

const launch = vi.hoisted(() => ({ bundled: false }));
vi.mock("./engineLaunch", () => ({
  shouldUseBundledEngine: () => launch.bundled,
  getBundledEnginePath: () => "/nonexistent/engine/cuepoint-engine",
}));

const standin = `
const http = require("http");
http
  .createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ version: "stand-in" }));
  })
  .listen(Number(process.env.CUEPOINT_PORT), "127.0.0.1");
`;

const deadStandin = `process.exit(3);`;

let dir: string;
let supervisors: EngineSupervisor[];

function supervisorWith(onStarted: () => void, script: string, extra: { healthTimeoutMs?: number } = {}) {
  const file = path.join(dir, `standin-${supervisors.length}.cjs`);
  writeFileSync(file, script);
  const supervisor = new EngineSupervisor({
    onStarted,
    restartBackoffMs: [5, 5, 5],
    healthTimeoutMs: extra.healthTimeoutMs,
    command: () => ({ command: process.execPath, args: [file] }),
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

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cuepoint-engine-started-"));
  supervisors = [];
  launch.bundled = false;
});

afterEach(async () => {
  for (const supervisor of supervisors) await supervisor.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("onStarted", () => {
  it("is called once the first start has answered", async () => {
    const onStarted = vi.fn();
    const supervisor = supervisorWith(onStarted, standin);
    expect(onStarted).not.toHaveBeenCalled();
    const status = await supervisor.start();
    expect(status.connected).toBe(true);
    expect(onStarted).toHaveBeenCalledTimes(1);
  }, 20_000);

  it("is called again after the person's Restart", async () => {
    const onStarted = vi.fn();
    const supervisor = supervisorWith(onStarted, standin);
    await supervisor.start();
    await supervisor.restart();
    expect(onStarted).toHaveBeenCalledTimes(2);
  }, 20_000);

  it("is called again after an automatic restart following a crash", async () => {
    const onStarted = vi.fn();
    const supervisor = supervisorWith(onStarted, standin);
    await supervisor.start();
    (supervisor as unknown as { child: { kill(): void } }).child.kill();
    await until(() => onStarted.mock.calls.length === 2);
    expect(supervisor.getStatus().connected).toBe(true);
  }, 20_000);

  it("is not called for an engine that never answered", async () => {
    const onStarted = vi.fn();
    const supervisor = supervisorWith(onStarted, deadStandin, { healthTimeoutMs: 300 });
    const status = await supervisor.start();
    expect(status.connected).toBe(false);
    expect(onStarted).not.toHaveBeenCalled();
  }, 20_000);

  it("does not fail the start when it throws", async () => {
    const supervisor = supervisorWith(() => {
      throw new Error("boom");
    }, standin);
    expect((await supervisor.start()).connected).toBe(true);
  }, 20_000);
});
