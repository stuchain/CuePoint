import { EventEmitter } from "node:events";
import net from "node:net";
import os from "node:os";
import path from "node:path";

/**
 * The mpv JSON IPC protocol, and nothing else (PLAYER-02, DEC-049).
 *
 * This module speaks to an mpv process over a socket. It does not start one,
 * does not know what a track is, and has no opinion about what should play
 * next — PLAYER-03 owns the process lifecycle and PLAYER-04 owns the queue.
 * Keeping it at protocol level is what makes it testable against a plain
 * `net.createServer`, with no mpv binary anywhere near the test suite.
 *
 * ## The protocol
 *
 * Newline-delimited JSON in both directions. A command is
 * `{"command": [...], "request_id": N}`; its reply is
 * `{"error": "success", "data": ..., "request_id": N}`. Anything carrying an
 * `event` field and no `request_id` is an asynchronous event.
 *
 * Three things make that harder than it sounds, and each has a test:
 *
 * 1. **TCP is a stream, not a message queue.** A single `data` chunk can hold
 *    half a line, three lines, or a line split mid-multibyte-character. The
 *    buffering below exists for that, and is where a naive implementation
 *    breaks first — usually in production, under load, not in a demo.
 * 2. **Replies can arrive for requests we no longer care about** (a timed-out
 *    request, or a stale id after a reconnect). An unknown `request_id` is
 *    ignored, never treated as an error.
 * 3. **A closing socket must not leave promises pending forever.** Every
 *    in-flight request is rejected exactly once when the connection ends.
 */

/** Why mpv stopped playing a file. `end-file`'s `reason` field. */
export type EndFileReason = "eof" | "stop" | "quit" | "error" | "redirect" | "unknown";

export interface MpvEndFile {
  reason: EndFileReason;
  /**
   * Why the file failed, when `reason` is `error` — e.g. "loading failed".
   *
   * mpv puts this in `file_error`, not `error`. Verified against the bundled
   * build, which emits
   * `{"event":"end-file","reason":"error","playlist_entry_id":1,"file_error":"loading failed"}`.
   * This is the text DEC-054's "skipped, and here is why" toast is built from,
   * so reading the wrong field loses the only explanation the user gets.
   */
  error?: string;
  playlistEntryId?: number;
}

export interface MpvPropertyChange<T = unknown> {
  name: string;
  data: T;
  /** The observe id mpv echoes back, used to route to the right observer. */
  id: number;
}

/** Any event mpv pushes, in its raw shape. */
export interface MpvEvent {
  event: string;
  [key: string]: unknown;
}

export interface MpvClientOptions {
  /** Pipe (Windows) or unix socket path to connect to. */
  socketPath: string;
  /**
   * How long a single command may wait for its reply.
   *
   * Not optional in spirit: without it a wedged mpv leaves the UI waiting on a
   * promise that never settles, which is indistinguishable to a user from the
   * app hanging.
   */
  requestTimeoutMs?: number;
  /** How long `connect()` waits before giving up. */
  connectTimeoutMs?: number;
  /** Injected for tests; defaults to `net.connect`. */
  createConnection?: (socketPath: string) => net.Socket;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

/**
 * Base arguments for the mpv process (consumed by PLAYER-03's supervisor).
 *
 * Declared here, beside the protocol they enable, so the flags the client
 * depends on cannot drift away from it:
 *
 * - `--idle=yes` keeps mpv alive with an empty playlist, which is the whole
 *   premise of driving it over IPC rather than per-file.
 * - `--no-video` / `--no-terminal`: this is an audio sidecar with no console.
 * - `--no-config` makes playback deterministic. A user's `~/.config/mpv` could
 *   otherwise change decoding, output or key bindings underneath CuePoint, and
 *   the resulting bug reports would be unreproducible.
 * - `--gapless-audio=yes` is DEC-056: gapless is the promise, crossfade is
 *   explicitly not. No crossfade filter is configured, here or anywhere.
 * - `--audio-client-name` is what the OS mixer shows the user.
 */
export const MPV_BASE_ARGS: readonly string[] = [
  "--idle=yes",
  "--no-video",
  "--no-terminal",
  "--no-config",
  "--gapless-audio=yes",
  "--audio-client-name=CuePoint",
];

/** The full argument list for an mpv listening on `socketPath`. */
export function buildMpvArgs(socketPath: string, extra: readonly string[] = []): string[] {
  return [...MPV_BASE_ARGS, `--input-ipc-server=${socketPath}`, ...extra];
}

/**
 * The properties playback state is derived from (PLAYER-03/PLAYER-04).
 *
 * One list, so the supervisor cannot observe a property the client never
 * mirrors, or forget one and leave a transport control permanently stale:
 *
 * - `time-pos` / `duration` drive the position bar (DEC-052)
 * - `pause` keeps the play/pause button honest when mpv changes state itself
 * - `eof-reached` and `idle-active` are how "the track ended" and "the queue
 *   ran out" are told apart, which PLAYER-04's advance rules need
 */
export const MPV_OBSERVED_PROPERTIES: readonly string[] = [
  "time-pos",
  "duration",
  "pause",
  "eof-reached",
  "idle-active",
];

/** Distinguishes paths created within the same millisecond. */
let socketSequence = 0;

/**
 * A socket path unique to this process and instance.
 *
 * Never a fixed name: two CuePoint windows, or a stale pipe left by a crash,
 * would otherwise collide and one instance would drive the other's player.
 *
 * The sequence number is not decoration. `pid` + milliseconds looks unique
 * until two clients are constructed in the same tick — which is exactly what a
 * supervisor restarting a dead player does — and then two "unique" paths are
 * the same string.
 */
export function createMpvSocketPath(
  id: string = `${process.pid}-${Date.now().toString(36)}-${(socketSequence++).toString(36)}`,
): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\cuepoint-mpv-${id}`;
  }
  return path.join(os.tmpdir(), `cuepoint-mpv-${id}.sock`);
}

/** A command mpv answered with an error. */
export class MpvCommandError extends Error {
  constructor(
    readonly mpvError: string,
    readonly command: readonly unknown[],
  ) {
    super(`mpv rejected ${JSON.stringify(command)}: ${mpvError}`);
    this.name = "MpvCommandError";
  }
}

/** A command that never got a reply. */
export class MpvTimeoutError extends Error {
  constructor(
    readonly command: readonly unknown[],
    readonly timeoutMs: number,
  ) {
    super(`mpv did not answer ${JSON.stringify(command)} within ${timeoutMs}ms`);
    this.name = "MpvTimeoutError";
  }
}

/** The connection went away with commands still in flight. */
export class MpvConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MpvConnectionError";
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  command: readonly unknown[];
  timer: NodeJS.Timeout;
}

type PropertyHandler = (value: unknown) => void;

/**
 * Events emitted by {@link MpvClient}.
 *
 * `error` is deliberately *not* a fatal signal here: a malformed line from mpv
 * is a protocol complaint, not a reason to tear down playback. Fatal ends of
 * the connection arrive as `close`.
 */
export interface MpvClientEventMap {
  event: [MpvEvent];
  "property-change": [MpvPropertyChange];
  "end-file": [MpvEndFile];
  close: [Error | undefined];
  error: [Error];
}

export class MpvClient extends EventEmitter<MpvClientEventMap> {
  private socket: net.Socket | null = null;
  private buffer = "";
  private nextRequestId = 1;
  private nextObserveId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly observers = new Map<number, { name: string; handler: PropertyHandler }>();
  private closed = false;
  private connectPromise: Promise<void> | null = null;

  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;
  private readonly connectionFactory: (socketPath: string) => net.Socket;

  constructor(private readonly options: MpvClientOptions) {
    super();
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.connectionFactory = options.createConnection ?? ((p) => net.connect(p));
  }

  get socketPath(): string {
    return this.options.socketPath;
  }

  get isConnected(): boolean {
    return this.socket !== null && !this.closed;
  }

  /** Number of commands awaiting a reply. Exposed for tests and diagnostics. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Open the connection. Idempotent: concurrent callers share one attempt,
   * which matters because PLAYER-03 may retry while a connect is in flight.
   */
  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    if (this.closed) {
      return Promise.reject(new MpvConnectionError("client is closed"));
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const socket = this.connectionFactory(this.options.socketPath);
      socket.setEncoding("utf8");

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.destroy();
        this.connectPromise = null;
        reject(
          new MpvConnectionError(
            `timed out connecting to ${this.options.socketPath} after ${this.connectTimeoutMs}ms`,
          ),
        );
      }, this.connectTimeoutMs);
      // Never hold the process open just to wait for a connection.
      timer.unref?.();

      const onConnect = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket = socket;
        resolve();
      };

      const onError = (error: Error) => {
        if (settled) {
          // Post-connection errors end the connection; `close` follows.
          this.emit("error", error);
          return;
        }
        settled = true;
        clearTimeout(timer);
        this.connectPromise = null;
        reject(error);
      };

      socket.on("connect", onConnect);
      socket.on("ready", onConnect);
      socket.on("error", onError);
      socket.on("data", (chunk: string | Buffer) => this.onData(chunk));
      socket.on("close", () => this.onClose());
    });

    return this.connectPromise;
  }

  /**
   * Close the connection and fail everything still in flight.
   *
   * Does not ask mpv to quit — that is process lifecycle, and PLAYER-03's.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    const socket = this.socket;
    this.socket = null;
    this.connectPromise = null;
    socket?.destroy();
    this.failPending(new MpvConnectionError("connection closed"));
  }

  /**
   * Send a raw command and resolve with its `data`.
   *
   * Everything else in this class is a wrapper around this.
   */
  command<T = unknown>(command: readonly unknown[]): Promise<T> {
    if (this.closed) {
      return Promise.reject(new MpvConnectionError("client is closed"));
    }
    const socket = this.socket;
    if (!socket) {
      return Promise.reject(new MpvConnectionError("not connected"));
    }

    const requestId = this.nextRequestId++;
    const payload = `${JSON.stringify({ command, request_id: requestId })}\n`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new MpvTimeoutError(command, this.requestTimeoutMs));
      }, this.requestTimeoutMs);
      timer.unref?.();

      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        command,
        timer,
      });

      socket.write(payload, (error) => {
        if (!error) return;
        // The write failed, so no reply is coming: settle now rather than
        // waiting out the timeout.
        const entry = this.pending.get(requestId);
        if (!entry) return;
        this.pending.delete(requestId);
        clearTimeout(entry.timer);
        reject(error);
      });
    });
  }

  async getProperty<T = unknown>(name: string): Promise<T> {
    return this.command<T>(["get_property", name]);
  }

  async setProperty(name: string, value: unknown): Promise<void> {
    await this.command(["set_property", name, value]);
  }

  /**
   * Watch a property, resolving to an unsubscribe function.
   *
   * The observe id is managed here so callers never see mpv's numbering; two
   * observers of the same property get their own ids and unsubscribe
   * independently.
   */
  async observeProperty(name: string, handler: PropertyHandler): Promise<() => Promise<void>> {
    const id = this.nextObserveId++;
    this.observers.set(id, { name, handler });
    try {
      await this.command(["observe_property", id, name]);
    } catch (error) {
      this.observers.delete(id);
      throw error;
    }
    let removed = false;
    return async () => {
      if (removed) return;
      removed = true;
      this.observers.delete(id);
      // Best effort: if the connection is already gone there is nothing to
      // unobserve, and failing here would be noise.
      if (this.isConnected) {
        await this.command(["unobserve_property", id]).catch(() => undefined);
      }
    };
  }

  /**
   * Typed wrappers for the properties Phase 5 actually drives.
   *
   * Thin on purpose, but not pointless: they keep mpv's property names in one
   * file. Spelled inline at each call site, a typo becomes a runtime
   * "property not found" in PLAYER-03 or PLAYER-06 instead of a compile error
   * here.
   */
  async setPaused(paused: boolean): Promise<void> {
    await this.setProperty("pause", paused);
  }

  /** mpv's volume is 0-100, not 0-1. */
  async setVolume(volume: number): Promise<void> {
    await this.setProperty("volume", volume);
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.setProperty("mute", muted);
  }

  /** DEC-055's device picker writes through here. */
  async setAudioDevice(device: string): Promise<void> {
    await this.setProperty("audio-device", device);
  }

  async setSpeed(speed: number): Promise<void> {
    await this.setProperty("speed", speed);
  }

  /** The devices mpv can see, for DEC-055's picker. */
  async getAudioDeviceList(): Promise<Array<{ name: string; description: string }>> {
    return this.getProperty("audio-device-list");
  }

  async loadFile(file: string, mode: "replace" | "append" | "append-play" = "replace"): Promise<void> {
    await this.command(["loadfile", file, mode]);
  }

  async stop(): Promise<void> {
    await this.command(["stop"]);
  }

  /** Seek. `absolute` is seconds from the start; `relative` is a delta. */
  async seek(seconds: number, mode: "absolute" | "relative" = "absolute"): Promise<void> {
    await this.command(["seek", seconds, mode]);
  }

  // -------------------------------------------------------------------------
  // Incoming data
  // -------------------------------------------------------------------------

  /**
   * Buffer and split newline-delimited JSON.
   *
   * The trailing partial line is kept for the next chunk. This is the part of
   * the protocol most likely to be got wrong, because it works fine right up
   * until a message is large enough or the machine busy enough to split.
   */
  private onData(chunk: string | Buffer): void {
    this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");

    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line) this.handleLine(line);
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // Not fatal. mpv is still running and the next line is probably fine;
      // tearing down playback over one unparseable line would be worse than
      // the line itself.
      this.emit("error", new Error(`unparseable line from mpv: ${line.slice(0, 200)}`));
      return;
    }

    if (typeof message.request_id === "number") {
      this.handleResponse(message as { request_id: number; error?: string; data?: unknown });
      return;
    }
    if (typeof message.event === "string") {
      this.handleEvent(message as unknown as MpvEvent);
    }
    // Anything else is neither a reply nor an event: ignore it rather than
    // guess. mpv may add message shapes we do not know about.
  }

  private handleResponse(message: { request_id: number; error?: string; data?: unknown }): void {
    const entry = this.pending.get(message.request_id);
    if (!entry) {
      // A reply to a request that already timed out, or a stale id. Ignoring
      // it is the correct behaviour — the alternative is crashing on a
      // perfectly legal message.
      return;
    }
    this.pending.delete(message.request_id);
    clearTimeout(entry.timer);

    if (message.error && message.error !== "success") {
      entry.reject(new MpvCommandError(message.error, entry.command));
      return;
    }
    entry.resolve(message.data);
  }

  private handleEvent(event: MpvEvent): void {
    this.emit("event", event);

    if (event.event === "property-change") {
      const change: MpvPropertyChange = {
        name: String(event.name ?? ""),
        data: event.data,
        id: typeof event.id === "number" ? event.id : -1,
      };
      const observer = this.observers.get(change.id);
      observer?.handler(change.data);
      this.emit("property-change", change);
      return;
    }

    if (event.event === "end-file") {
      // `file_error` is what mpv actually sends; `error` is accepted as a
      // fallback so a future or older build that used the other spelling still
      // produces a message rather than silence.
      const fileError = event.file_error ?? event.error;
      this.emit("end-file", {
        reason: normalizeEndFileReason(event.reason),
        error: typeof fileError === "string" ? fileError : undefined,
        playlistEntryId:
          typeof event.playlist_entry_id === "number" ? event.playlist_entry_id : undefined,
      });
    }
  }

  private onClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.socket = null;
    this.connectPromise = null;
    const error = new MpvConnectionError("mpv connection closed");
    this.failPending(error);
    this.emit("close", error);
  }

  /** Reject every in-flight request exactly once. */
  private failPending(error: Error): void {
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.observers.clear();
  }
}

function normalizeEndFileReason(value: unknown): EndFileReason {
  switch (value) {
    case "eof":
    case "stop":
    case "quit":
    case "error":
    case "redirect":
      return value;
    default:
      return "unknown";
  }
}
