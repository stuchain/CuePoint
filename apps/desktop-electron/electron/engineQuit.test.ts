import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EngineSupervisor } from "./engineSupervisor";

/**
 * On Windows a stop asks the engine to quit before it stops the process tree (test.5, 10-30):
 * `taskkill /F` ends the one-file bootloader too, and only the bootloader deletes the copy of the
 * engine it unpacked into the temp folder, once the engine has ended by itself. Elsewhere the
 * polite stop is a signal the bootloader forwards, so nothing changes there.
 */
vi.mock("./engineLaunch", () => ({
  shouldUseBundledEngine: () => false,
  getBundledEnginePath: () => "/nonexistent/engine/cuepoint-engine",
}));

const treeStops = vi.hoisted(() => [] as Array<{ force: boolean }>);
vi.mock("./processTree", async (importOriginal) => {
  const real = await importOriginal<typeof import("./processTree")>();
  return {
    ...real,
    // The real stop on this machine's platform; only counted.
    stopProcessTree: (proc: Parameters<typeof real.stopProcessTree>[0], options: { force?: boolean } = {}) => {
      treeStops.push({ force: options.force ?? false });
      real.stopProcessTree(proc, { force: options.force });
    },
  };
});

// `QUIT_ANSWER` is the status the stand-in answers the quit with; 202 means it then exits by itself.
const server = `
const fs = require("fs");
const http = require("http");
const answer = Number(process.env.QUIT_ANSWER);
http.createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.method === "POST" && req.url === "/api/v1/engine/quit") {
    fs.writeFileSync(process.env.QUIT_SEEN, req.headers.authorization === "Bearer " + process.env.CUEPOINT_TOKEN ? "token" : "no token");
    res.statusCode = answer;
    res.end(JSON.stringify({ quitting: answer === 202 }));
    if (answer === 202) setTimeout(() => process.exit(0), 50);
    return;
  }
  res.end(JSON.stringify({ version: "stand-in" }));
}).listen(Number(process.env.CUEPOINT_PORT), "127.0.0.1");
`;

let dir: string;
let supervisors: EngineSupervisor[];

function make(platform: NodeJS.Platform, answer: number): EngineSupervisor {
  const file = path.join(dir, "standin.cjs");
  writeFileSync(file, server);
  process.env.QUIT_ANSWER = String(answer);
  process.env.QUIT_SEEN = path.join(dir, "quit-seen");
  const supervisor = new EngineSupervisor({
    healthTimeoutMs: 5000,
    platform,
    command: () => ({ command: process.execPath, args: [file] }),
  });
  supervisors.push(supervisor);
  return supervisor;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "cuepoint-quit-"));
  supervisors = [];
  treeStops.length = 0;
  process.env.CUEPOINT_HOME = dir;
});

afterEach(async () => {
  for (const s of supervisors) await s.stop();
  delete process.env.CUEPOINT_HOME;
  delete process.env.QUIT_ANSWER;
  delete process.env.QUIT_SEEN;
  rmSync(dir, { recursive: true, force: true });
});

describe("stopping the engine", () => {
  it("on Windows asks it to quit, with the token, and leaves the tree alone when it does", async () => {
    const supervisor = make("win32", 202);
    expect((await supervisor.start()).connected).toBe(true);

    await supervisor.stop();

    expect(readFileSync(path.join(dir, "quit-seen"), "utf-8")).toBe("token");
    expect(treeStops).toEqual([]);
    expect(supervisor.getStatus().connected).toBe(false);
  });

  it("on Windows stops the tree when the engine will not quit", async () => {
    const supervisor = make("win32", 404);
    expect((await supervisor.start()).connected).toBe(true);

    await supervisor.stop();

    expect(readFileSync(path.join(dir, "quit-seen"), "utf-8")).toBe("token");
    expect(treeStops[0]).toEqual({ force: false });
  });

  it("elsewhere stops the process as before, without asking", async () => {
    const supervisor = make("linux", 202);
    expect((await supervisor.start()).connected).toBe(true);

    await supervisor.stop();

    expect(existsSync(path.join(dir, "quit-seen"))).toBe(false);
    expect(treeStops[0]).toEqual({ force: false });
  });
});
