import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EngineSupervisor, type EngineStatus } from "./engineSupervisor";

/**
 * `onStatusChanged` is how the window learns of a stop at once: a killed engine is back in a
 * second or so, quicker than the page's 4 s poll, so without a push the page never saw it.
 * The engine is a small Node stand-in, as in `engineStarted.test.ts`.
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

function build(script: string, onStatusChanged: () => void) {
  const file = path.join(dir, `standin-${supervisors.length}.cjs`);
  writeFileSync(file, script);
  const supervisor = new EngineSupervisor({
    onStatusChanged,
    restartBackoffMs: [5, 5, 5],
    healthTimeoutMs: 5000,
    command: () => ({ command: process.execPath, args: [file] }),
  });
  supervisors.push(supervisor);
  return supervisor;
}

/** The status the supervisor reports each time it says it changed. */
function recording() {
  const seen: EngineStatus[] = [];
  const holder: { supervisor?: EngineSupervisor } = {};
  const onStatusChanged = () => {
    if (holder.supervisor) seen.push(holder.supervisor.getStatus());
  };
  return {
    seen,
    make(script: string) {
      holder.supervisor = build(script, onStatusChanged);
      return holder.supervisor;
    },
  };
}

async function until(condition: () => boolean, ms = 8000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cuepoint-engine-status-"));
  supervisors = [];
  launch.bundled = false;
});

afterEach(async () => {
  for (const supervisor of supervisors) await supervisor.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("onStatusChanged", () => {
  it("is called when the engine becomes healthy", async () => {
    const rec = recording();
    const supervisor = rec.make(standin);
    await supervisor.start();
    expect(rec.seen.at(-1)?.connected).toBe(true);
  }, 20_000);

  it("is called for an exit nobody asked for, and for the restart that follows", async () => {
    const rec = recording();
    const supervisor = rec.make(standin);
    await supervisor.start();
    rec.seen.length = 0;

    (supervisor as unknown as { child: { kill(): void } }).child.kill();
    await until(() => rec.seen.at(-1)?.connected === true);

    // It was seen down, and seen reconnecting, before it was seen healthy.
    expect(rec.seen.some((s) => !s.connected && s.reconnecting)).toBe(true);
    expect(rec.seen.at(-1)?.connected).toBe(true);
  }, 20_000);

  it("is called when the automatic attempts give up", async () => {
    const rec = recording();
    const supervisor = rec.make(deadStandin);
    await supervisor.start();
    await until(() => {
      const last = rec.seen.at(-1);
      return last !== undefined && !last.connected && !last.reconnecting && last.restartAttempts === 3;
    });
  }, 30_000);

  it("is called when the person's restart begins and when it ends", async () => {
    const rec = recording();
    const supervisor = rec.make(standin);
    await supervisor.start();
    rec.seen.length = 0;

    await supervisor.restart();

    expect(rec.seen.length).toBeGreaterThanOrEqual(2);
    expect(rec.seen[0]?.connected).toBe(false);
    expect(rec.seen.at(-1)?.connected).toBe(true);
  }, 20_000);

  it("never fails the start when it throws", async () => {
    const supervisor = build(standin, () => {
      throw new Error("boom");
    });
    expect((await supervisor.start()).connected).toBe(true);
  }, 20_000);
});
