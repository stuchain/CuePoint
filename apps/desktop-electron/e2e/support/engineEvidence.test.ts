import net from "node:net";
import { describe, expect, it } from "vitest";

import { formatEvidence, looksUnreachable, portListening, tailLines } from "./engineEvidence";

describe("engine evidence", () => {
  it("takes the last non-empty lines", () => {
    expect(tailLines("a\n\nb\r\nc\n", 2)).toEqual(["b", "c"]);
    expect(tailLines("", 5)).toEqual([]);
    expect(tailLines("x".repeat(10), 1, 4)).toEqual(["xxxx..."]);
  });

  it("calls a refused or dropped connection unreachable, and an engine's own error not", () => {
    expect(looksUnreachable(new Error("page.evaluate: Error: fetch failed"))).toBe(true);
    expect(looksUnreachable(new Error("connect ECONNREFUSED 127.0.0.1:5"))).toBe(true);
    expect(looksUnreachable(new Error("the engine never reported itself connected"))).toBe(true);
    expect(looksUnreachable(new Error("Engine error 409: LIBRARY_BUSY"))).toBe(false);
  });

  it("reports the supervisor, the port and both logs", () => {
    const text = formatEvidence({
      what: "startLibraryImport",
      error: "fetch failed\nstack",
      view: {
        pid: 42,
        port: 5555,
        healthy: false,
        status: { connected: false, error: "Reconnecting", reconnecting: true },
        restartAttempts: 1,
        reconnecting: true,
        spawned: 2,
        exits: 1,
        lastExit: { code: 1, signal: null, uptimeMs: 1800 },
        heartbeatActive: false,
        heartbeatMisses: 0,
        stopRequested: false,
        maintenance: false,
        stdout: ["out line"],
        stderr: ["Traceback", "OSError: [WinError 10048]"],
      },
      listening: false,
      logs: [{ file: "home/logs/cuepoint.log", lines: ["log line"] }],
    });
    expect(text).toContain("during startLibraryImport: fetch failed");
    expect(text).not.toContain("stack");
    expect(text).toContain("pid=42 port=5555");
    expect(text).toContain("exits=1 restartAttempts=1");
    expect(text).toContain("last exit code=1 signal=null after 1800 ms");
    expect(text).toContain("port 5555 listening: false");
    expect(text).toContain("OSError: [WinError 10048]");
    expect(text).toContain("out line");
    expect(text).toContain("log line");
  });

  it("says so when main could not be asked, and when there is no log", () => {
    const text = formatEvidence({
      what: "x",
      error: "fetch failed",
      view: { unavailable: "main did not answer in 5 s" },
      listening: null,
      logs: [],
    });
    expect(text).toContain("supervisor: unavailable (main did not answer in 5 s)");
    expect(text).toContain("no cuepoint.log found");
  });

  it("sees whether a port is listening", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as net.AddressInfo).port;
    expect(await portListening(port)).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await portListening(port)).toBe(false);
  });
});
