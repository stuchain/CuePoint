import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { describeError, EngineEvidenceWriter, isUnreachable, MAX_REPORTS } from "./engineEvidenceForTest";
import type { EngineDiagnostics } from "./engineSupervisor";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function closedPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

function view(port: number): EngineDiagnostics {
  return {
    pid: 42,
    port,
    healthy: true,
    status: { connected: true },
    restartAttempts: 0,
    reconnecting: false,
    spawned: 1,
    exits: 0,
    lastExit: null,
    heartbeatActive: true,
    heartbeatMisses: 0,
    sinceSpawnMs: 9000,
    sinceHealthyMs: 7000,
    sinceHeartbeatMs: null,
    stopRequested: false,
    maintenance: false,
    stdout: [],
    stderr: [],
  };
}

describe("main's engine evidence (e2e only)", () => {
  it("knows an unreachable engine from one that answered", () => {
    expect(isUnreachable(new TypeError("fetch failed"))).toBe(true);
    expect(isUnreachable(new Error("Engine error 409: LIBRARY_BUSY"))).toBe(false);
    expect(isUnreachable("fetch failed")).toBe(false);
  });

  it("follows the causes to the socket's code", () => {
    const socket = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5"), { code: "ECONNREFUSED" });
    const lines = describeError(new TypeError("fetch failed", { cause: socket }));
    expect(lines).toEqual([
      "error: TypeError: fetch failed",
      "cause: Error: connect ECONNREFUSED 127.0.0.1:5 [ECONNREFUSED]",
    ]);
  });

  it("writes a report with the cause and the port's state, and stops after a few", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cp-evidence-"));
    const home = mkdtempSync(path.join(tmpdir(), "cp-home-"));
    dirs.push(dir, home);
    const port = await closedPort();
    const logged: string[] = [];
    const writer = new EngineEvidenceWriter({
      diagnostics: () => view(port),
      env: { CUEPOINT_E2E_EVIDENCE_DIR: dir, CUEPOINT_HOME: home },
      log: (text) => logged.push(text),
    });
    const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    for (let i = 0; i < MAX_REPORTS + 2; i += 1) {
      writer.note("library:import", new TypeError("fetch failed", { cause: refused }));
      await expect.poll(() => logged.length, { timeout: 10_000 }).toBe(Math.min(i + 1, MAX_REPORTS));
    }
    writer.note("library:browse", new Error("Engine error 409: LIBRARY_BUSY"));
    expect(readdirSync(dir)).toHaveLength(MAX_REPORTS);
    const text = readFileSync(path.join(dir, readdirSync(dir)[0]!), "utf-8");
    expect(text).toContain("Engine unreachable from main on library:import");
    expect(text).toContain("[ECONNREFUSED]");
    expect(text).toContain(`port ${port} from main: ECONNREFUSED`);
    expect(text).toContain("ms since spawn=9000 healthy=7000 heartbeat=never");
    // Nothing answered the engine's request file here, and the report says so.
    expect(text).toMatch(/no answer in \d+ ms/);
    expect(text.split("\n").at(-1)).toMatch(/^SUMMARY library:import: /);
  }, 60_000);
});
