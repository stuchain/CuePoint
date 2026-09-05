import fs from "node:fs";
import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MPV_BASE_ARGS,
  MPV_OBSERVED_PROPERTIES,
  MpvClient,
  MpvCommandError,
  MpvConnectionError,
  MpvTimeoutError,
  buildMpvArgs,
  createMpvSocketPath,
} from "./mpvClient";

/**
 * PLAYER-02's tests. No mpv binary is started anywhere in this file.
 *
 * The fake below is a real `net` server on a real named pipe (Windows) or unix
 * socket (everywhere else), so the transport under test is the one the app will
 * actually use, and CI's three-OS matrix exercises both shapes. What it is not
 * is mpv: it replies with whatever the test tells it to, including the awkward
 * things a real server does — a reply split across three packets, two messages
 * in one packet, a reply to a request that no longer exists, and a socket that
 * dies mid-conversation.
 */

/** A scriptable stand-in for mpv's IPC socket. */
class FakeMpvServer {
  readonly path = createMpvSocketPath(`test-${Math.random().toString(36).slice(2)}`);
  private server: net.Server | null = null;
  private connection: net.Socket | null = null;
  private buffer = "";
  /** Resolves once a client has actually connected. */
  private connected!: Promise<void>;
  private markConnected!: () => void;
  readonly received: Array<Record<string, unknown>> = [];
  /** Called for each complete command line the client sends. */
  onCommand: ((command: Record<string, unknown>, server: FakeMpvServer) => void) | null = null;

  async start(): Promise<void> {
    this.connected = new Promise<void>((resolve) => {
      this.markConnected = resolve;
    });
    await new Promise<void>((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.connection = socket;
        this.markConnected();
        socket.setEncoding("utf8");
        socket.on("data", (chunk: string) => this.consume(chunk));
        socket.on("error", () => undefined);
      });
      this.server.once("error", reject);
      this.server.listen(this.path, () => resolve());
    });
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index !== -1) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        this.received.push(parsed);
        this.onCommand?.(parsed, this);
      }
      index = this.buffer.indexOf("\n");
    }
  }

  /**
   * Wait until a client is connected.
   *
   * Connecting resolves on the *client* before the server's connection
   * callback necessarily runs, so a test that pushes data immediately after
   * `connect()` can write before there is anywhere to write to.
   */
  async waitForConnection(): Promise<void> {
    await this.connected;
  }

  /** Write a message as one line. */
  send(message: unknown): void {
    this.writeRaw(`${JSON.stringify(message)}\n`);
  }

  /** Write raw bytes, so a test can split or corrupt a line deliberately. */
  writeRaw(data: string): void {
    if (!this.connection) {
      // Loudly, not silently: a no-op write here made ten tests fail with
      // "no events received" and no hint as to why.
      throw new Error("FakeMpvServer: no client is connected");
    }
    this.connection.write(data);
  }

  /** Reply "success" to a command, echoing its request id. */
  reply(command: Record<string, unknown>, data: unknown = null): void {
    this.send({ error: "success", data, request_id: command.request_id });
  }

  dropConnection(): void {
    this.connection?.destroy();
    this.connection = null;
  }

  async stop(): Promise<void> {
    this.connection?.destroy();
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = null;
    if (process.platform !== "win32") {
      try {
        fs.unlinkSync(this.path);
      } catch {
        // Already gone; nothing to clean up.
      }
    }
  }
}

const servers: FakeMpvServer[] = [];
const clients: MpvClient[] = [];

async function startServer(): Promise<FakeMpvServer> {
  const server = new FakeMpvServer();
  await server.start();
  servers.push(server);
  return server;
}

async function connectedClient(
  server: FakeMpvServer,
  options: { requestTimeoutMs?: number } = {},
): Promise<MpvClient> {
  const client = new MpvClient({ socketPath: server.path, ...options });
  clients.push(client);
  await client.connect();
  await server.waitForConnection();
  return client;
}

/** Let queued socket I/O drain. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const server of servers.splice(0)) await server.stop();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Socket paths and process arguments
// ---------------------------------------------------------------------------

describe("socket path", () => {
  it("is different every time", () => {
    // A fixed name would let two CuePoint windows, or a stale pipe from a
    // crash, drive each other's player.
    expect(createMpvSocketPath()).not.toBe(createMpvSocketPath());
  });

  it("uses a named pipe on Windows", () => {
    const platform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      expect(createMpvSocketPath("abc")).toBe("\\\\.\\pipe\\cuepoint-mpv-abc");
    } finally {
      Object.defineProperty(process, "platform", { value: platform, configurable: true });
    }
  });

  it("uses a filesystem socket elsewhere", () => {
    const platform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    try {
      const socketPath = createMpvSocketPath("abc");
      expect(socketPath).toMatch(/cuepoint-mpv-abc\.sock$/);
      expect(socketPath).not.toContain("\\\\.\\pipe");
    } finally {
      Object.defineProperty(process, "platform", { value: platform, configurable: true });
    }
  });
});

describe("mpv arguments", () => {
  it("points mpv at the socket the client will connect to", () => {
    expect(buildMpvArgs("/tmp/x.sock")).toContain("--input-ipc-server=/tmp/x.sock");
  });

  it("keeps mpv alive and silent for use as a sidecar", () => {
    const args = buildMpvArgs("/tmp/x.sock");
    expect(args).toContain("--idle=yes");
    expect(args).toContain("--no-video");
    expect(args).toContain("--no-terminal");
  });

  it("ignores the user's mpv config", () => {
    // Otherwise a stray ~/.config/mpv changes decoding or output underneath
    // CuePoint and the bug report is unreproducible.
    expect(buildMpvArgs("/tmp/x.sock")).toContain("--no-config");
  });

  it("enables gapless and configures no crossfade (DEC-056)", () => {
    const args = buildMpvArgs("/tmp/x.sock");
    expect(args).toContain("--gapless-audio=yes");
    expect(args.some((a) => /crossfade|--af=|--lavfi/.test(a))).toBe(false);
  });

  it("appends caller-supplied arguments after the defaults", () => {
    const args = buildMpvArgs("/tmp/x.sock", ["--audio-device=foo"]);
    expect(args.at(-1)).toBe("--audio-device=foo");
    expect(args).toEqual(expect.arrayContaining([...MPV_BASE_ARGS]));
  });
});

// ---------------------------------------------------------------------------
// Connecting
// ---------------------------------------------------------------------------

describe("connect", () => {
  it("connects to a listening socket", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    expect(client.isConnected).toBe(true);
  });

  it("rejects when nothing is listening", async () => {
    const client = new MpvClient({ socketPath: createMpvSocketPath("nobody-home") });
    clients.push(client);
    await expect(client.connect()).rejects.toThrow();
  });

  it("rejects when the connection never completes", async () => {
    // A socket that never fires `connect`, so only the timeout can settle it.
    const client = new MpvClient({
      socketPath: "irrelevant",
      connectTimeoutMs: 30,
      createConnection: () => new net.Socket(),
    });
    clients.push(client);
    await expect(client.connect()).rejects.toThrow(MpvConnectionError);
  });

  it("shares one attempt between concurrent callers", async () => {
    const server = await startServer();
    const client = new MpvClient({ socketPath: server.path });
    clients.push(client);
    const [a, b] = [client.connect(), client.connect()];
    await Promise.all([a, b]);
    expect(a).toBe(b);
  });

  it("can be retried after a failed connect", async () => {
    // mpv does not create its IPC socket the instant its process exists, so
    // the supervisor always retries. Treating a failed attempt as "closed"
    // made the client single-use and broke the first play of every session.
    const server = new FakeMpvServer();
    servers.push(server);
    const client = new MpvClient({ socketPath: server.path });
    clients.push(client);

    await expect(client.connect()).rejects.toThrow(); // nothing listening yet

    await server.start();
    await expect(client.connect()).resolves.toBeUndefined();
    expect(client.isConnected).toBe(true);
  });

  it("still works after several failed attempts", async () => {
    const server = new FakeMpvServer();
    servers.push(server);
    const client = new MpvClient({ socketPath: server.path });
    clients.push(client);

    for (let i = 0; i < 3; i += 1) {
      await expect(client.connect()).rejects.toThrow();
    }
    await server.start();
    await client.connect();
    await server.waitForConnection();
    server.onCommand = (command, s) => s.reply(command, "alive");

    await expect(client.command(["get_property", "mpv-version"])).resolves.toBe("alive");
  });

  it("a stale attempt closing later does not kill a live connection", async () => {
    // The other direction of the same identity check: an abandoned socket
    // emitting `close` after a later attempt succeeded must not tear it down.
    const server = await startServer();
    const client = await connectedClient(server);
    const closes: unknown[] = [];
    client.on("close", () => closes.push(true));

    // A socket that was never adopted as the live connection.
    const orphan = net.connect(server.path);
    await flush();
    orphan.destroy();
    await flush();

    expect(closes).toHaveLength(0);
    expect(client.isConnected).toBe(true);
  });

  it("refuses to connect after close", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    client.close();
    await expect(client.connect()).rejects.toThrow(/closed/);
  });
});

// ---------------------------------------------------------------------------
// Commands and replies
// ---------------------------------------------------------------------------

describe("commands", () => {
  it("resolves with the reply's data", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command, 42);
    const client = await connectedClient(server);

    await expect(client.command(["get_property", "volume"])).resolves.toBe(42);
  });

  it("sends the command as newline-delimited JSON with a request id", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command);
    const client = await connectedClient(server);

    await client.command(["set_property", "pause", true]);

    expect(server.received[0]).toEqual({
      command: ["set_property", "pause", true],
      request_id: expect.any(Number),
    });
  });

  it("correlates concurrent commands even when replies come back out of order", async () => {
    const server = await startServer();
    const queued: Array<Record<string, unknown>> = [];
    server.onCommand = (command) => queued.push(command);
    const client = await connectedClient(server);

    const first = client.command(["one"]);
    const second = client.command(["two"]);
    const third = client.command(["three"]);
    await flush();

    // Answer them backwards; each promise must still get its own answer.
    server.reply(queued[2], "third");
    server.reply(queued[0], "first");
    server.reply(queued[1], "second");

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    await expect(third).resolves.toBe("third");
  });

  it("rejects with mpv's own error text", async () => {
    const server = await startServer();
    server.onCommand = (command, s) =>
      s.send({ error: "property not found", request_id: command.request_id });
    const client = await connectedClient(server);

    await expect(client.command(["get_property", "nope"])).rejects.toThrow(MpvCommandError);
    await expect(client.command(["get_property", "nope"])).rejects.toThrow(/property not found/);
  });

  it("rejects before a connection exists", async () => {
    const client = new MpvClient({ socketPath: createMpvSocketPath("unconnected") });
    clients.push(client);
    await expect(client.command(["stop"])).rejects.toThrow(/not connected/);
  });

  it("rejects after close", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    client.close();
    await expect(client.command(["stop"])).rejects.toThrow(/closed/);
  });
});

// ---------------------------------------------------------------------------
// Framing — the part that breaks in production, not in a demo
// ---------------------------------------------------------------------------

describe("message framing", () => {
  it("reassembles a reply split across several packets", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const pending = client.command(["get_property", "duration"]);
    await flush();

    const line = JSON.stringify({
      error: "success",
      data: 123.5,
      request_id: server.received[0].request_id,
    });
    server.writeRaw(line.slice(0, 10));
    await flush();
    server.writeRaw(line.slice(10, 25));
    await flush();
    server.writeRaw(`${line.slice(25)}\n`);

    await expect(pending).resolves.toBe(123.5);
  });

  it("handles several messages arriving in one packet", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const first = client.command(["a"]);
    const second = client.command(["b"]);
    await flush();

    const one = JSON.stringify({ error: "success", data: 1, request_id: server.received[0].request_id });
    const two = JSON.stringify({ error: "success", data: 2, request_id: server.received[1].request_id });
    server.writeRaw(`${one}\n${two}\n`);

    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(2);
  });

  it("holds a trailing partial line until the rest arrives", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const first = client.command(["a"]);
    const second = client.command(["b"]);
    await flush();

    const one = JSON.stringify({ error: "success", data: 1, request_id: server.received[0].request_id });
    const two = JSON.stringify({ error: "success", data: 2, request_id: server.received[1].request_id });
    server.writeRaw(`${one}\n${two.slice(0, 12)}`);
    await expect(first).resolves.toBe(1);

    server.writeRaw(`${two.slice(12)}\n`);
    await expect(second).resolves.toBe(2);
  });

  it("ignores blank lines", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => {
      s.writeRaw("\n\n");
      s.reply(command, "ok");
    };
    const client = await connectedClient(server);
    await expect(client.command(["x"])).resolves.toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// Messages we did not ask for
// ---------------------------------------------------------------------------

describe("unexpected messages", () => {
  it("ignores a reply whose request id is unknown", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const errors: Error[] = [];
    client.on("error", (error) => errors.push(error));

    // A stale reply — e.g. to a request that already timed out.
    server.send({ error: "success", data: "ghost", request_id: 9999 });
    await flush();

    expect(errors).toHaveLength(0);
    expect(client.isConnected).toBe(true);
  });

  it("still works after an unknown reply", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command, "fine");
    const client = await connectedClient(server);

    server.send({ error: "success", data: "ghost", request_id: 9999 });
    await flush();

    await expect(client.command(["still", "working"])).resolves.toBe("fine");
  });

  it("reports an unparseable line without dropping the connection", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const errors: Error[] = [];
    client.on("error", (error) => errors.push(error));

    server.writeRaw("this is not json\n");
    await flush();

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/unparseable/);
    expect(client.isConnected).toBe(true);
  });

  it("processes the next line after an unparseable one", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    client.on("error", () => undefined);
    const pending = client.command(["x"]);
    await flush();

    server.writeRaw("{ broken\n");
    server.reply(server.received[0], "recovered");

    await expect(pending).resolves.toBe("recovered");
  });

  it("ignores a message that is neither a reply nor an event", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const errors: Error[] = [];
    client.on("error", (error) => errors.push(error));

    server.send({ something: "unexpected" });
    await flush();

    expect(errors).toHaveLength(0);
    expect(client.isConnected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Timeouts
// ---------------------------------------------------------------------------

describe("timeouts", () => {
  it("rejects a command that is never answered", async () => {
    const server = await startServer();
    server.onCommand = () => undefined; // deliberate silence
    const client = await connectedClient(server, { requestTimeoutMs: 40 });

    await expect(client.command(["get_property", "volume"])).rejects.toThrow(MpvTimeoutError);
  });

  it("names the command that timed out", async () => {
    const server = await startServer();
    server.onCommand = () => undefined;
    const client = await connectedClient(server, { requestTimeoutMs: 40 });

    await expect(client.command(["get_property", "volume"])).rejects.toThrow(/get_property/);
  });

  it("forgets a timed-out request instead of leaking it", async () => {
    const server = await startServer();
    server.onCommand = () => undefined;
    const client = await connectedClient(server, { requestTimeoutMs: 40 });

    await expect(client.command(["slow"])).rejects.toThrow(MpvTimeoutError);

    expect(client.pendingCount).toBe(0);
  });

  it("does not reject a command that answered in time", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command, "quick");
    const client = await connectedClient(server, { requestTimeoutMs: 200 });

    await expect(client.command(["fast"])).resolves.toBe("quick");
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(client.pendingCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Losing the connection
// ---------------------------------------------------------------------------

describe("connection loss", () => {
  it("rejects every in-flight command exactly once", async () => {
    const server = await startServer();
    server.onCommand = () => undefined;
    const client = await connectedClient(server, { requestTimeoutMs: 10_000 });

    let rejections = 0;
    const settled = [
      client.command(["a"]),
      client.command(["b"]),
      client.command(["c"]),
    ].map((p) =>
      p.then(
        () => undefined,
        () => {
          rejections += 1;
        },
      ),
    );
    await flush();

    server.dropConnection();
    await Promise.all(settled);
    await flush();

    expect(rejections).toBe(3);
    expect(client.pendingCount).toBe(0);
  });

  it("rejects with a connection error, not a timeout", async () => {
    const server = await startServer();
    server.onCommand = () => undefined;
    const client = await connectedClient(server, { requestTimeoutMs: 10_000 });
    const pending = client.command(["a"]);
    await flush();

    server.dropConnection();

    await expect(pending).rejects.toThrow(MpvConnectionError);
  });

  it("emits close once", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const closes: unknown[] = [];
    client.on("close", (error) => closes.push(error));

    server.dropConnection();
    await flush();

    expect(closes).toHaveLength(1);
  });

  it("reports itself disconnected afterwards", async () => {
    const server = await startServer();
    const client = await connectedClient(server);

    server.dropConnection();
    await flush();

    expect(client.isConnected).toBe(false);
  });

  it("close() is idempotent and emits nothing after the socket already died", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const closes: unknown[] = [];
    client.on("close", () => closes.push(true));

    server.dropConnection();
    await flush();
    client.close();
    client.close();
    await flush();

    expect(closes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

describe("events", () => {
  it("emits raw mpv events", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const events: unknown[] = [];
    client.on("event", (event) => events.push(event));

    server.send({ event: "playback-restart" });
    await flush();

    expect(events).toEqual([{ event: "playback-restart" }]);
  });

  it("reports end-file with its reason", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const ends: Array<{ reason: string }> = [];
    client.on("end-file", (info) => ends.push(info));

    server.send({ event: "end-file", reason: "eof" });
    await flush();

    expect(ends).toEqual([{ reason: "eof", error: undefined, playlistEntryId: undefined }]);
  });

  it("carries the error text when a file fails (PLAYER-10 depends on this)", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const ends: Array<{ reason: string; error?: string; playlistEntryId?: number }> = [];
    client.on("end-file", (info) => ends.push(info));

    // The exact payload the bundled mpv emits for a missing file, captured
    // from the real binary. Reading `error` instead of `file_error` here
    // silently loses the only explanation DEC-054's toast can give the user.
    server.send({
      event: "end-file",
      reason: "error",
      playlist_entry_id: 1,
      file_error: "loading failed",
    });
    await flush();

    expect(ends[0]).toMatchObject({
      reason: "error",
      error: "loading failed",
      playlistEntryId: 1,
    });
  });

  it("accepts the alternative `error` spelling as a fallback", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const ends: Array<{ error?: string }> = [];
    client.on("end-file", (info) => ends.push(info));

    server.send({ event: "end-file", reason: "error", error: "Failed to open file" });
    await flush();

    expect(ends[0].error).toBe("Failed to open file");
  });

  it("normalizes an unrecognized reason rather than passing it through", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const ends: Array<{ reason: string }> = [];
    client.on("end-file", (info) => ends.push(info));

    server.send({ event: "end-file", reason: "something-new" });
    await flush();

    expect(ends[0].reason).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Property observation
// ---------------------------------------------------------------------------

describe("observeProperty", () => {
  it("asks mpv to observe and routes changes to the handler", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command);
    const client = await connectedClient(server);
    const seen: unknown[] = [];

    await client.observeProperty("time-pos", (value) => seen.push(value));
    const observe = server.received.find((m) => (m.command as unknown[])[0] === "observe_property");
    const observeId = (observe?.command as unknown[])[1];
    server.send({ event: "property-change", id: observeId, name: "time-pos", data: 12.5 });
    await flush();

    expect(seen).toEqual([12.5]);
  });

  it("keeps two observers of the same property independent", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command);
    const client = await connectedClient(server);
    const a: unknown[] = [];
    const b: unknown[] = [];

    await client.observeProperty("pause", (v) => a.push(v));
    await client.observeProperty("pause", (v) => b.push(v));
    const ids = server.received
      .filter((m) => (m.command as unknown[])[0] === "observe_property")
      .map((m) => (m.command as unknown[])[1]);

    expect(new Set(ids).size).toBe(2);
    server.send({ event: "property-change", id: ids[0], name: "pause", data: true });
    await flush();

    expect(a).toEqual([true]);
    expect(b).toEqual([]);
  });

  it("stops routing after unsubscribe", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command);
    const client = await connectedClient(server);
    const seen: unknown[] = [];

    const unsubscribe = await client.observeProperty("volume", (v) => seen.push(v));
    const observe = server.received.find((m) => (m.command as unknown[])[0] === "observe_property");
    const observeId = (observe?.command as unknown[])[1];
    await unsubscribe();

    server.send({ event: "property-change", id: observeId, name: "volume", data: 50 });
    await flush();

    expect(seen).toEqual([]);
  });

  it("tells mpv to stop observing", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command);
    const client = await connectedClient(server);

    const unsubscribe = await client.observeProperty("volume", () => undefined);
    await unsubscribe();

    expect(
      server.received.some((m) => (m.command as unknown[])[0] === "unobserve_property"),
    ).toBe(true);
  });

  it("unsubscribing twice is harmless", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command);
    const client = await connectedClient(server);

    const unsubscribe = await client.observeProperty("volume", () => undefined);
    await unsubscribe();
    await unsubscribe();

    expect(
      server.received.filter((m) => (m.command as unknown[])[0] === "unobserve_property"),
    ).toHaveLength(1);
  });

  it("does not leave a dangling observer when the observe command fails", async () => {
    const server = await startServer();
    server.onCommand = (command, s) =>
      s.send({ error: "unknown property", request_id: command.request_id });
    const client = await connectedClient(server);

    await expect(client.observeProperty("nope", () => undefined)).rejects.toThrow(MpvCommandError);

    // A later property-change carrying the same id must not reach a handler
    // that was never successfully registered.
    server.send({ event: "property-change", id: 1, name: "nope", data: 1 });
    await flush();
    expect(client.isConnected).toBe(true);
  });

  it("emits property-change for callers that want every change", async () => {
    const server = await startServer();
    const client = await connectedClient(server);
    const changes: Array<{ name: string; data: unknown }> = [];
    client.on("property-change", (change) => changes.push(change));

    server.send({ event: "property-change", id: 7, name: "time-pos", data: 3 });
    await flush();

    expect(changes).toEqual([{ name: "time-pos", data: 3, id: 7 }]);
  });
});

// ---------------------------------------------------------------------------
// Typed command wrappers
// ---------------------------------------------------------------------------

describe("command wrappers", () => {
  async function capture(): Promise<{ server: FakeMpvServer; client: MpvClient }> {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command, null);
    const client = await connectedClient(server);
    return { server, client };
  }

  it("loads a file, replacing what is playing by default (DEC-013)", async () => {
    const { server, client } = await capture();
    await client.loadFile("C:/music/track.flac");
    expect(server.received[0].command).toEqual(["loadfile", "C:/music/track.flac", "replace"]);
  });

  it("can append instead, for Play Next and Add to Queue", async () => {
    const { server, client } = await capture();
    await client.loadFile("/music/a.flac", "append");
    expect(server.received[0].command).toEqual(["loadfile", "/music/a.flac", "append"]);
  });

  it("seeks absolutely by default", async () => {
    const { server, client } = await capture();
    await client.seek(30);
    expect(server.received[0].command).toEqual(["seek", 30, "absolute"]);
  });

  it("seeks relatively when asked", async () => {
    const { server, client } = await capture();
    await client.seek(-10, "relative");
    expect(server.received[0].command).toEqual(["seek", -10, "relative"]);
  });

  it("sets and gets properties", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command, 75);
    const client = await connectedClient(server);

    await client.setProperty("volume", 75);
    await expect(client.getProperty<number>("volume")).resolves.toBe(75);

    expect(server.received[0].command).toEqual(["set_property", "volume", 75]);
    expect(server.received[1].command).toEqual(["get_property", "volume"]);
  });

  it("stops playback", async () => {
    const { server, client } = await capture();
    await client.stop();
    expect(server.received[0].command).toEqual(["stop"]);
  });

  it("writes the property names Phase 5 drives", async () => {
    const { server, client } = await capture();

    await client.setPaused(true);
    await client.setVolume(80);
    await client.setMuted(false);
    await client.setAudioDevice("wasapi/{guid}");
    await client.setSpeed(1);

    expect(server.received.map((m) => m.command)).toEqual([
      ["set_property", "pause", true],
      ["set_property", "volume", 80],
      ["set_property", "mute", false],
      ["set_property", "audio-device", "wasapi/{guid}"],
      ["set_property", "speed", 1],
    ]);
  });

  it("reads the audio device list for the DEC-055 picker", async () => {
    const devices = [{ name: "auto", description: "Autoselect device" }];
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command, devices);
    const client = await connectedClient(server);

    await expect(client.getAudioDeviceList()).resolves.toEqual(devices);
    expect(server.received[0].command).toEqual(["get_property", "audio-device-list"]);
  });
});

describe("observed properties", () => {
  it("covers what the transport and the queue need", () => {
    // Position and duration for the seek bar (DEC-052); pause so the button
    // stays honest if mpv changes state on its own; eof/idle to tell "track
    // ended" from "queue ran out" (PLAYER-04).
    expect(MPV_OBSERVED_PROPERTIES).toEqual([
      "time-pos",
      "duration",
      "pause",
      "eof-reached",
      "idle-active",
    ]);
  });

  it("can all actually be observed", async () => {
    const server = await startServer();
    server.onCommand = (command, s) => s.reply(command);
    const client = await connectedClient(server);

    for (const name of MPV_OBSERVED_PROPERTIES) {
      await client.observeProperty(name, () => undefined);
    }

    const observed = server.received
      .filter((m) => (m.command as unknown[])[0] === "observe_property")
      .map((m) => (m.command as unknown[])[2]);
    expect(observed).toEqual([...MPV_OBSERVED_PROPERTIES]);
  });
});
