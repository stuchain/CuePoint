import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUDIO_INIT_FAILURE,
  PLAYER_OUTPUT_LINES,
  PlayerSupervisor,
  PlayerUnavailableError,
  exclusiveOutputSupported,
  isAudioOutputFailure,
} from "./playerSupervisor";
import type { ProcessIncident, ProcessReporter } from "./processWatch";

/**
 * The player's lifecycle (PLAYER-03).
 *
 * No mpv is started here and no Electron runtime is needed: the supervisor
 * takes its `spawn` and its client as options precisely so the restart policy,
 * the lazy start and the state machine can be exercised directly. The tests
 * that drive the real binary live in `playerSupervisor.integration.test.ts`.
 */

/** A child process that never existed. */
class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;
  readonly killSignals: Array<string | undefined> = [];
  /**
   * A stderr pipe, because that is what the real spawn creates.
   *
   * `PassThrough` and not a bare emitter: the point of the supervisor reading
   * this is back-pressure, and only a real stream has any.
   */
  readonly stderr = new PassThrough();

  /** Write a line the way mpv writes one. */
  say(text: string): void {
    // Arrives a moment later, as a pipe's contents do: output written just before an exit is
    // read after the `exit` event, not before it.
    setImmediate(() => this.stderr.write(text));
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.killSignals.push(signal);
    this.killed = true;
    // A real child exits asynchronously after a signal.
    setTimeout(() => this.exit(0), 0);
    return true;
  }

  /**
   * Simulate the process ending, as a crash or after a kill.
   *
   * As a real child does: `exit` first, and `close` only once stderr has been read to its end,
   * so output still in the pipe at `exit` arrives after it.
   */
  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
    this.stderr.once("end", () => this.emit("close", code, signal));
    // After what `say` queued before it, as a pipe closes after its contents are read.
    setImmediate(() => this.stderr.end());
  }
}

/** An MpvClient stand-in that records what it was asked to do. */
class FakeClient extends EventEmitter {
  readonly commands: unknown[][] = [];
  readonly observed: string[] = [];
  connected = false;
  connectFailures = 0;
  closed = false;
  private handlers = new Map<string, (value: unknown) => void>();

  constructor(readonly socketPath: string) {
    super();
  }

  async connect(): Promise<void> {
    if (this.connectFailures > 0) {
      this.connectFailures -= 1;
      throw new Error("ENOENT: socket not there yet");
    }
    this.connected = true;
  }

  close(): void {
    this.closed = true;
    this.connected = false;
  }

  async command(command: unknown[]): Promise<unknown> {
    this.commands.push(command);
    return null;
  }

  async observeProperty(name: string, handler: (value: unknown) => void): Promise<() => Promise<void>> {
    this.observed.push(name);
    this.handlers.set(name, handler);
    return async () => {
      this.handlers.delete(name);
    };
  }

  /** Push a property change the way mpv would. */
  emitProperty(name: string, value: unknown): void {
    this.handlers.get(name)?.(value);
  }

  /** Answer `loadfile` with a playlist entry id, as mpv does; off, it answers nothing. */
  returnEntryIds = false;
  private nextEntryId = 1;
  /** When set, each `loadfile` waits on the next of these before answering. */
  loadGates: Array<Promise<void>> = [];
  async loadFile(file: string, mode = "replace"): Promise<number | undefined> {
    this.commands.push(["loadfile", file, mode]);
    const gate = this.loadGates.shift();
    if (gate) await gate;
    return this.returnEntryIds ? this.nextEntryId++ : undefined;
  }
  async stop(): Promise<void> {
    this.commands.push(["stop"]);
  }
  async seek(seconds: number, mode = "absolute"): Promise<void> {
    this.commands.push(["seek", seconds, mode]);
  }
  async setPaused(paused: boolean): Promise<void> {
    this.commands.push(["set_property", "pause", paused]);
  }
  /** What mpv answers a `time-pos` read with; null by default, as before a position exists. */
  settledTimePos: number | null = null;
  /** When set, a `time-pos` read waits on it (a never-settling promise models a stuck mpv). */
  timePosGate: Promise<unknown> | null = null;
  /** What each `idle-active` read gets, in turn (then it answers): a hung mpv never answers (HARDEN-05). */
  idleActiveScript: Array<"answer" | "hang"> = [];
  /** How many `idle-active` reads have been made. */
  idleActiveReads = 0;
  /** Set to make every `idle-active` read hang from now on. */
  silent = false;
  /** The request timeout each `idle-active` read was given. */
  idleActiveTimeouts: Array<number | undefined> = [];
  async getProperty(name: string, timeoutMs?: number): Promise<unknown> {
    this.commands.push(["get_property", name]);
    if (name === "idle-active") {
      this.idleActiveTimeouts.push(timeoutMs);
      this.idleActiveReads += 1;
      const next = this.idleActiveScript.shift();
      if (this.silent || next === "hang") return new Promise(() => undefined);
      return false;
    }
    if (this.timePosGate) return this.timePosGate;
    return name === "time-pos" ? this.settledTimePos : null;
  }
  async setVolume(volume: number): Promise<void> {
    this.commands.push(["set_property", "volume", volume]);
  }
  async setMuted(muted: boolean): Promise<void> {
    this.commands.push(["set_property", "mute", muted]);
  }
  async setAudioDevice(device: string): Promise<void> {
    this.commands.push(["set_property", "audio-device", device]);
  }
  async setAudioExclusive(exclusive: boolean): Promise<void> {
    this.commands.push(["set_property", "audio-exclusive", exclusive]);
  }
  async getAudioDeviceList(): Promise<Array<{ name: string; description: string }>> {
    this.commands.push(["get_property", "audio-device-list"]);
    return this.devices;
  }
  /** What this fake pretends the machine has plugged in. */
  devices: Array<{ name: string; description: string }> = [
    { name: "auto", description: "Autoselect device" },
    { name: "wasapi/{interface}", description: "Speakers (Focusrite USB Audio)" },
  ];
}

interface Harness {
  supervisor: PlayerSupervisor;
  children: FakeChild[];
  clients: FakeClient[];
  spawnCalls: Array<{ binary: string; args: string[] }>;
}

function harness(
  overrides: {
    exists?: (candidate: string) => boolean;
    spawnThrows?: Error;
    connectFailures?: number;
    maxRestartAttempts?: number;
    stableUptimeMs?: number;
    reporter?: ProcessReporter;
    /** Replaces the heartbeat's timings (HARDEN-05). */
    heartbeat?: { intervalMs?: number; timeoutMs?: number; maxMisses?: number };
    /** Called with each child as it is spawned, and its index; for tests that make one misbehave. */
    onSpawn?: (child: FakeChild, index: number) => void;
    /** Exclusive output exists only on some platforms (PLAYER-11, DEC-055). */
    platform?: NodeJS.Platform;
  } = {},
): Harness {
  const children: FakeChild[] = [];
  const clients: FakeClient[] = [];
  const spawnCalls: Array<{ binary: string; args: string[] }> = [];

  const supervisor = new PlayerSupervisor({
    packaged: false,
    repoRoot: "/repo",
    platform: overrides.platform ?? "linux",
    arch: "x64",
    env: {},
    exists: overrides.exists ?? (() => true),
    connectAttempts: 3,
    connectRetryMs: 1,
    restartBackoffMs: [1, 1, 1],
    maxRestartAttempts: overrides.maxRestartAttempts,
    stableUptimeMs: overrides.stableUptimeMs,
    reporter: overrides.reporter,
    heartbeat: overrides.heartbeat,
    positionPushIntervalMs: 5,
    createSocketPath: () => `/tmp/sock-${children.length}`,
    spawn: ((binary: string, args: string[]) => {
      if (overrides.spawnThrows) throw overrides.spawnThrows;
      spawnCalls.push({ binary, args });
      const child = new FakeChild();
      children.push(child);
      overrides.onSpawn?.(child, children.length - 1);
      return child;
    }) as never,
    createClient: ((socketPath: string) => {
      const client = new FakeClient(socketPath);
      client.connectFailures = overrides.connectFailures ?? 0;
      clients.push(client);
      return client;
    }) as never,
  });

  return { supervisor, children, clients, spawnCalls };
}

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait for `condition`, by polling; the wait is bounded and fails loudly. */
async function until(condition: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

const supervisors: PlayerSupervisor[] = [];
function track(h: Harness): Harness {
  supervisors.push(h.supervisor);
  return h;
}

afterEach(async () => {
  for (const supervisor of supervisors.splice(0)) await supervisor.dispose();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

describe("availability", () => {
  it("reports unavailable when no binary is installed", () => {
    const { supervisor } = track(harness({ exists: () => false }));
    const status = supervisor.getStatus();
    expect(status.available).toBe(false);
    expect(status.running).toBe(false);
    expect(status.error).toContain("fetch_player_sidecar.py");
  });

  it("reports available but not running before the first play", () => {
    const { supervisor } = track(harness());
    expect(supervisor.getStatus()).toMatchObject({ available: true, running: false });
  });

  it("starts no process until something is played (lazy start)", async () => {
    // A session where nobody presses play must not pay for a second process,
    // which is also what makes DEC-053's "bar appears on first play" honest.
    const { supervisor, spawnCalls } = track(harness());
    supervisor.getStatus();
    supervisor.getSnapshot();
    await settle(5);
    expect(spawnCalls).toHaveLength(0);
  });

  it("notices a binary that appears mid-session", () => {
    // Someone runs the fetch script while the app is open.
    let present = false;
    const { supervisor } = track(harness({ exists: () => present }));
    expect(supervisor.getStatus().available).toBe(false);
    present = true;
    expect(supervisor.getStatus().available).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

describe("starting", () => {
  it("spawns mpv with the IPC socket and the gapless flag", async () => {
    const { supervisor, spawnCalls } = track(harness());
    await supervisor.play("/music/a.flac");

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].args).toContain("--input-ipc-server=/tmp/sock-0");
    expect(spawnCalls[0].args).toContain("--gapless-audio=yes");
    expect(spawnCalls[0].args).toContain("--idle=yes");
  });

  it("observes the properties the transport is built from", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    expect(clients[0].observed).toEqual([
      "time-pos",
      "duration",
      "pause",
      "eof-reached",
      "idle-active",
    ]);
  });

  it("retries until mpv has created its socket", async () => {
    // The socket does not exist the instant the process does.
    const { supervisor, clients } = track(harness({ connectFailures: 2 }));
    await supervisor.play("/music/a.flac");
    expect(clients[0].connected).toBe(true);
  });

  it("starts only one process when play is called twice quickly", async () => {
    const { supervisor, spawnCalls } = track(harness());
    await Promise.all([supervisor.play("/music/a.flac"), supervisor.play("/music/b.flac")]);
    expect(spawnCalls).toHaveLength(1);
  });

  it("reuses the running process for later plays", async () => {
    const { supervisor, spawnCalls } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.play("/music/b.flac");
    expect(spawnCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The failure the step was flagged for
// ---------------------------------------------------------------------------

describe("telling failures apart", () => {
  it("says the player is unavailable when there is no binary", async () => {
    const { supervisor } = track(harness({ exists: () => false }));
    await expect(supervisor.play("/music/a.flac")).rejects.toThrow(PlayerUnavailableError);
  });

  it("names the missing player rather than blaming the file", async () => {
    // PLAYER-03's stated risk: the first play of a session must not report
    // "this track failed" when what actually failed was starting mpv.
    const { supervisor } = track(harness({ exists: () => false }));
    await expect(supervisor.play("/music/a.flac")).rejects.toThrow(/player/i);
    await expect(supervisor.play("/music/a.flac")).rejects.not.toThrow(/a\.flac/);
  });

  it("reports a spawn that throws as the player being unavailable", async () => {
    const { supervisor } = track(harness({ spawnThrows: new Error("EACCES") }));
    await expect(supervisor.play("/music/a.flac")).rejects.toThrow(PlayerUnavailableError);
  });

  it("reports a socket that never appears as the player not starting", async () => {
    const { supervisor } = track(harness({ connectFailures: 99 }));
    await expect(supervisor.play("/music/a.flac")).rejects.toThrow(/did not start/i);
  });

  it("leaves a file failure to the end-file event, not the play call", async () => {
    // A file that will not decode resolves `play` and fails later — which is
    // what DEC-054 and PLAYER-10 are built on.
    const { supervisor, clients } = track(harness());
    const failures: string[] = [];
    supervisor.onEndFile((info) => failures.push(info.reason));

    await expect(supervisor.play("/music/broken.flac")).resolves.toBeUndefined();
    clients[0].emit("end-file", { reason: "error", error: "loading failed" });

    expect(failures).toEqual(["error"]);
  });
});

// ---------------------------------------------------------------------------
// Restarting
// ---------------------------------------------------------------------------

describe("restarting after a crash", () => {
  it("brings a crashed player back", async () => {
    const { supervisor, children, spawnCalls } = track(harness());
    await supervisor.play("/music/a.flac");

    children[0].exit(1);
    await settle(40);

    expect(spawnCalls.length).toBeGreaterThan(1);
    expect(supervisor.getStatus().running).toBe(true);
  });

  it("gives up after a bounded number of attempts", async () => {
    // Unlimited restarts would hide a crash-looping player behind a flickering
    // status (the DEC-028 reasoning, applied here).
    const { supervisor, children, spawnCalls } = track(harness({ maxRestartAttempts: 2 }));
    await supervisor.play("/music/a.flac");

    for (let i = 0; i < 6; i += 1) {
      children.at(-1)?.exit(1);
      await settle(20);
    }

    expect(spawnCalls.length).toBeLessThanOrEqual(3); // first start + 2 attempts
    expect(supervisor.getStatus().running).toBe(false);
  });

  it("says so once it has given up", async () => {
    const { supervisor, children } = track(harness({ maxRestartAttempts: 1 }));
    await supervisor.play("/music/a.flac");

    for (let i = 0; i < 4; i += 1) {
      children.at(-1)?.exit(1);
      await settle(20);
    }

    expect(supervisor.getStatus().error).toMatch(/stopped responding/i);
  });

  it("resets the attempt budget once playing again", async () => {
    // A later, unrelated crash gets a full set of attempts rather than
    // inheriting the count from an old failure.
    const { supervisor, children } = track(harness());
    await supervisor.play("/music/a.flac");
    children[0].exit(1);
    await settle(40);

    await supervisor.play("/music/b.flac");

    expect(supervisor.getStatus().restartAttempts).toBe(0);
  });

  it("does not resume playback by itself", async () => {
    // The queue is PLAYER-04's and DEC-014 says nothing is restored; coming
    // back ready to play is the goal, not pretending the crash did not happen.
    const { supervisor, children, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    const before = clients[0].commands.length;

    children[0].exit(1);
    await settle(40);

    const restarted = clients.at(-1);
    expect(restarted?.commands.some((c) => (c as string[])[0] === "loadfile")).toBe(false);
    expect(before).toBeGreaterThan(0);
  });

  it("does not reset the budget just because a start succeeded", async () => {
    // The trap this rule exists for: mpv that launches cleanly and then dies
    // immediately — failing to open an audio device, say — starts successfully
    // every time. Resetting on a successful start would restart it forever,
    // which is the unbounded loop the budget is supposed to prevent.
    const { supervisor, children, spawnCalls } = track(
      harness({ maxRestartAttempts: 2, stableUptimeMs: 60_000 }),
    );
    await supervisor.play("/music/a.flac");

    for (let i = 0; i < 6; i += 1) {
      children.at(-1)?.exit(1);
      await settle(20);
    }

    expect(spawnCalls.length).toBeLessThanOrEqual(3);
  });

  it("gives a fresh budget to a player that had been running happily", async () => {
    // A crash after an hour of playing is a new problem, not a continuation of
    // an old crash loop.
    const { supervisor, children, spawnCalls } = track(
      harness({ maxRestartAttempts: 1, stableUptimeMs: 10 }),
    );
    await supervisor.play("/music/a.flac");

    for (let i = 0; i < 3; i += 1) {
      await settle(25); // outlive the stable threshold
      children.at(-1)?.exit(1);
      await settle(25);
    }

    // Each crash earned its own attempt, so restarts kept happening.
    expect(spawnCalls.length).toBeGreaterThan(2);
    expect(supervisor.getStatus().error).toBeUndefined();
  });

  it("treats a deliberate stop as not a crash", async () => {
    const { supervisor, spawnCalls } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.stop();
    await settle(30);
    expect(spawnCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

describe("shutdown", () => {
  it("asks mpv to quit before killing it", async () => {
    // `quit` lets mpv release the audio device itself, which matters most in
    // exclusive mode (DEC-055) where a killed process can leave it held.
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.stop();

    expect(clients[0].commands).toContainEqual(["quit"]);
    expect(clients[0].closed).toBe(true);
  });

  it("leaves no process behind", async () => {
    const { supervisor, children } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.stop();

    expect(children[0].exitCode).not.toBeNull();
  });

  it("is safe to stop when nothing was ever started", async () => {
    const { supervisor } = track(harness());
    await expect(supervisor.stop()).resolves.toBeUndefined();
  });

  it("refuses to start again after dispose", async () => {
    const { supervisor } = track(harness());
    await supervisor.dispose();
    await expect(supervisor.play("/music/a.flac")).rejects.toThrow(/shut down/i);
  });

  it("stops an mpv whose start a quit landed in the middle of", async () => {
    // Playwright asks the app to quit through the inspector, which runs the quit
    // in the middle of whatever JavaScript is running: here, between the spawn
    // and the supervisor keeping the child. dispose() found nothing to stop and
    // that mpv outlived the app, holding the test runner's pipes (Linux e2e).
    let disposing: Promise<void> | null = null;
    const h = track(
      harness({
        onSpawn: () => {
          disposing = h.supervisor.dispose();
        },
      }),
    );
    await expect(h.supervisor.play("/music/a.flac")).rejects.toThrow(/shut down/i);
    await disposing;

    expect(h.children).toHaveLength(1);
    expect(h.children[0].killed).toBe(true);
  });

  it("clears playback state on stop", async () => {
    const { supervisor } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.stop();
    expect(supervisor.getSnapshot().playback.filePath).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Transport and state
// ---------------------------------------------------------------------------

describe("transport", () => {
  it("loads the file and unpauses", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    expect(clients[0].commands).toContainEqual(["loadfile", "/music/a.flac", "replace"]);
    expect(clients[0].commands).toContainEqual(["set_property", "pause", false]);
  });

  it("pauses and resumes", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.pause();
    expect(supervisor.getSnapshot().playback.paused).toBe(true);
    await supervisor.resume();
    expect(supervisor.getSnapshot().playback.paused).toBe(false);
    expect(clients[0].commands).toContainEqual(["set_property", "pause", true]);
  });

  describe("pause position", () => {
    it("pushes one paused snapshot carrying mpv's settled time-pos, not the last throttled one", async () => {
      const { supervisor, clients } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      const seen: Array<{ paused: boolean; position: number | null }> = [];
      supervisor.onSnapshot((s) => seen.push({ paused: s.playback.paused, position: s.playback.positionSeconds }));
      clients[0].settledTimePos = 10.31;
      await supervisor.pause();
      expect(seen).toEqual([{ paused: true, position: 10.31 }]);
      expect(supervisor.getSnapshot().playback.positionSeconds).toBe(10.31);
    });

    it("pushes nothing about the pause until the settled position is known", async () => {
      const { supervisor, clients } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      const seen: Array<{ paused: boolean; position: number | null }> = [];
      supervisor.onSnapshot((s) => seen.push({ paused: s.playback.paused, position: s.playback.positionSeconds }));
      clients[0].settledTimePos = 10.31;
      const pausing = supervisor.pause();
      // mpv's own pause event and a time-pos arrive while the read is in flight.
      clients[0].emitProperty("pause", true);
      clients[0].emitProperty("time-pos", 10.2);
      await pausing;
      await new Promise((resolve) => setTimeout(resolve, 20));
      // Exactly one paused push, and it carries a settled value, not the stale 10.
      const pushed = seen.filter((s) => s.paused).map((s) => s.position);
      expect(pushed).toHaveLength(1);
      expect([10.2, 10.31]).toContain(pushed[0]);
    });

    it("ignores a stale time-pos while paused", async () => {
      const { supervisor, clients } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      clients[0].settledTimePos = 10.31;
      await supervisor.pause();
      clients[0].emitProperty("time-pos", 10.25);
      clients[0].emitProperty("time-pos", 10.4);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(supervisor.getSnapshot().playback.positionSeconds).toBe(10.31);
    });

    it("follows time-pos again once resumed, from the paused position", async () => {
      const { supervisor, clients } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      clients[0].settledTimePos = 10.31;
      await supervisor.pause();
      await supervisor.resume();
      expect(supervisor.getSnapshot().playback.positionSeconds).toBe(10.31);
      clients[0].emitProperty("time-pos", 10.5);
      expect(supervisor.getSnapshot().playback.positionSeconds).toBe(10.5);
    });

    it("settles a pause mpv decided on its own the same way", async () => {
      const { supervisor, clients } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      clients[0].settledTimePos = 10.31;
      clients[0].emitProperty("pause", true);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(supervisor.getSnapshot().playback.positionSeconds).toBe(10.31);
      clients[0].emitProperty("time-pos", 10.2);
      expect(supervisor.getSnapshot().playback.positionSeconds).toBe(10.31);
    });

    it("does not let a throttled push already waiting carry the stale position", async () => {
      const { supervisor, clients } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      await settle(20);
      // Within the interval of the last push: this one waits on the timer.
      clients[0].emitProperty("time-pos", 10.1);
      clients[0].emitProperty("time-pos", 10.2);
      const seen: Array<{ paused: boolean; position: number | null }> = [];
      supervisor.onSnapshot((s) => seen.push({ paused: s.playback.paused, position: s.playback.positionSeconds }));
      let release!: (v: number) => void;
      clients[0].timePosGate = new Promise<number>((resolve) => (release = resolve));
      const pausing = supervisor.pause();
      await settle(40);
      expect(seen).toEqual([]);
      release(10.31);
      await pausing;
      expect(seen).toEqual([{ paused: true, position: 10.31 }]);
    });

    it("gives up on a read that never answers and pushes the position it had", async () => {
      const { supervisor, clients } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      clients[0].timePosGate = new Promise(() => undefined);
      const seen: Array<{ paused: boolean; position: number | null }> = [];
      supervisor.onSnapshot((s) => seen.push({ paused: s.playback.paused, position: s.playback.positionSeconds }));
      const started = Date.now();
      await supervisor.pause();
      expect(Date.now() - started).toBeLessThan(400);
      expect(seen).toEqual([{ paused: true, position: 10 }]);
    });

    it("pushes no late paused snapshot when resumed while the read is in flight", async () => {
      const { supervisor, clients } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      let release!: (v: number) => void;
      clients[0].timePosGate = new Promise<number>((resolve) => (release = resolve));
      const seen: boolean[] = [];
      supervisor.onSnapshot((s) => seen.push(s.playback.paused));
      const pausing = supervisor.pause();
      await settle(5);
      clients[0].timePosGate = null;
      await supervisor.resume();
      release(10.31);
      await pausing;
      await settle(20);
      expect(seen).not.toContain(true);
      expect(supervisor.getSnapshot().playback.paused).toBe(false);
    });

    it("pushes no paused snapshot when playback stops or a new track starts mid-settle", async () => {
      const { supervisor, clients } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      let release!: (v: number) => void;
      clients[0].timePosGate = new Promise<number>((resolve) => (release = resolve));
      const pausing = supervisor.pause();
      await settle(5);
      await supervisor.stopPlayback();
      const seen: Array<number | null> = [];
      supervisor.onSnapshot((s) => seen.push(s.playback.positionSeconds));
      release(10.31);
      await pausing;
      await settle(20);
      expect(seen).toEqual([]);
      expect(supervisor.getSnapshot().playback.positionSeconds).toBeNull();
      clients[0].timePosGate = null;
      await supervisor.play("/music/b.flac");
      clients[0].emitProperty("time-pos", 0.5);
      expect(supervisor.getSnapshot().playback.positionSeconds).toBe(0.5);
    });

    it("pushes no late paused snapshot when the player crashes mid-settle", async () => {
      const { supervisor, clients, children } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      let release!: (v: number) => void;
      clients[0].timePosGate = new Promise<number>((resolve) => (release = resolve));
      const pausing = supervisor.pause();
      await settle(5);
      children[0].exit(1);
      await settle(20);
      const seen: boolean[] = [];
      supervisor.onSnapshot((s) => seen.push(s.playback.paused && s.playback.positionSeconds === 10.31));
      release(10.31);
      await pausing.catch(() => undefined);
      await settle(20);
      expect(seen).not.toContain(true);
    });

    it("keeps the position it had when mpv gives no settled one", async () => {
      const { supervisor, clients } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      await supervisor.pause();
      expect(supervisor.getSnapshot().playback.positionSeconds).toBe(10);
    });

    it("still takes the position of a seek made while paused", async () => {
      const { supervisor, clients } = track(harness());
      await supervisor.play("/music/a.flac");
      clients[0].emitProperty("time-pos", 10);
      clients[0].settledTimePos = 10.31;
      await supervisor.pause();
      await supervisor.seek(42);
      clients[0].emitProperty("time-pos", 42.02);
      expect(supervisor.getSnapshot().playback.positionSeconds).toBe(42.02);
    });
  });

  it("toggles from whatever state it is in", async () => {
    const { supervisor } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.togglePause();
    expect(supervisor.getSnapshot().playback.paused).toBe(true);
    await supervisor.togglePause();
    expect(supervisor.getSnapshot().playback.paused).toBe(false);
  });

  it("seeks to an absolute position", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.seek(42);
    expect(clients[0].commands).toContainEqual(["seek", 42, "absolute"]);
  });

  it("seeks once the file it was just given has opened", async () => {
    // Found by the end-to-end test: mpv refuses a seek while the file a
    // `loadfile` gave it is still opening, so play-then-seek failed whenever
    // the seek arrived first.
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    const client = clients[0]!;
    const seek = client.seek.bind(client);
    let refused = false;
    client.seek = async (seconds: number, mode = "absolute") => {
      if (!refused) {
        refused = true;
        throw new Error("error running command");
      }
      await seek(seconds, mode);
    };

    const seeking = supervisor.seek(3);
    await new Promise((resolve) => setImmediate(resolve));
    client.emit("event", { event: "file-loaded" });
    await seeking;

    expect(client.commands).toContainEqual(["seek", 3, "absolute"]);
    expect(supervisor.getSnapshot().playback.positionSeconds).toBe(3);
  });

  it("passes a refused seek on when no file is opening", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    const client = clients[0]!;
    client.emit("event", { event: "file-loaded" });
    client.seek = async () => {
      throw new Error("error running command");
    };
    await expect(supervisor.seek(3)).rejects.toThrow("error running command");
  });

  it("clamps volume to mpv's range", async () => {
    const { supervisor } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.setVolume(500);
    expect(supervisor.getSnapshot().playback.volume).toBe(100);
    await supervisor.setVolume(-20);
    expect(supervisor.getSnapshot().playback.volume).toBe(0);
  });

  it("remembers volume across a stop", async () => {
    const { supervisor } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.setVolume(30);
    await supervisor.stop();
    expect(supervisor.getSnapshot().playback.volume).toBe(30);
  });

  it("refuses transport commands when nothing is running", async () => {
    const { supervisor } = track(harness());
    await expect(supervisor.seek(10)).rejects.toThrow(PlayerUnavailableError);
  });

  it("accepts a volume change before the player has started", async () => {
    // Setting the volume must not be what spawns a process.
    const { supervisor, spawnCalls } = track(harness());
    await supervisor.setVolume(40);
    expect(supervisor.getSnapshot().playback.volume).toBe(40);
    expect(spawnCalls).toHaveLength(0);
  });

  it("applies a volume set before the start to the player that starts", async () => {
    // Otherwise the snapshot says 40 and mpv is at 100: the bar would show a
    // volume that was never true, and the first track would play at full.
    const { supervisor, clients } = track(harness());
    await supervisor.setVolume(40);
    await supervisor.setMuted(true);

    await supervisor.play("/music/a.flac");

    expect(clients[0]!.commands).toContainEqual(["set_property", "volume", 40]);
    expect(clients[0]!.commands).toContainEqual(["set_property", "mute", true]);
  });

  it("says nothing about volume when it is still the default", async () => {
    // A start that has nothing to restore should not talk to mpv about it.
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");

    expect(
      clients[0]!.commands.filter((command) => command[1] === "volume"),
    ).toHaveLength(0);
  });
});

describe("seeking", () => {
  /** A harness whose `seek` answers only when the returned function is called. */
  async function withDeferredSeek() {
    const h = track(harness());
    await h.supervisor.play("/music/a.flac");
    const client = h.clients[0]!;
    let release: () => void = () => undefined;
    client.seek = async (seconds: number, mode = "absolute") => {
      client.commands.push(["seek", seconds, mode]);
      await new Promise<void>((resolve) => (release = resolve));
    };
    return { ...h, client, release: () => release() };
  }
  const position = (s: PlayerSupervisor) => s.getSnapshot().playback.positionSeconds;

  it("keeps the target against a stale time-pos from before and after the reply", async () => {
    const { supervisor, client, release } = await withDeferredSeek();
    const seeking = supervisor.seek(42);
    expect(position(supervisor)).toBe(42);
    client.emitProperty("time-pos", 10);
    expect(position(supervisor)).toBe(42);
    release();
    await seeking;
    client.emitProperty("time-pos", 10.1);
    expect(position(supervisor)).toBe(42);
  });

  it("takes a value near the target and stops holding", async () => {
    const { supervisor, client, release } = await withDeferredSeek();
    const seeking = supervisor.seek(42);
    release();
    await seeking;
    client.emitProperty("time-pos", 42.05);
    expect(position(supervisor)).toBe(42.05);
    client.emitProperty("time-pos", 90);
    expect(position(supervisor)).toBe(90);
  });

  it("takes a far value again once the settle window has passed", async () => {
    const { supervisor, client, release } = await withDeferredSeek();
    const now = vi.spyOn(Date, "now");
    const t0 = Date.now();
    now.mockReturnValue(t0);
    const seeking = supervisor.seek(42);
    release();
    await seeking;
    client.emitProperty("time-pos", 10);
    expect(position(supervisor)).toBe(42);
    now.mockReturnValue(t0 + 751);
    client.emitProperty("time-pos", 10.2);
    expect(position(supervisor)).toBe(10.2);
  });

  it("stopPlayback clears the hold", async () => {
    const { supervisor, client, release } = await withDeferredSeek();
    const seeking = supervisor.seek(42);
    release();
    await seeking;
    await supervisor.stopPlayback();
    client.emitProperty("time-pos", 10);
    expect(position(supervisor)).toBe(10);
  });

  it("play of a new track clears the hold", async () => {
    const { supervisor, client, release } = await withDeferredSeek();
    const seeking = supervisor.seek(42);
    release();
    await seeking;
    await supervisor.play("/music/b.flac");
    client.emitProperty("time-pos", 1);
    expect(position(supervisor)).toBe(1);
  });

  it("end-file clears the hold", async () => {
    const { supervisor, client, release } = await withDeferredSeek();
    const seeking = supervisor.seek(42);
    release();
    await seeking;
    client.emit("end-file", {});
    client.emitProperty("time-pos", 3);
    expect(position(supervisor)).toBe(3);
  });

  it("clears the hold when the seek throws", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    const c = clients[0]!;
    c.seek = async () => {
      throw new Error("error running command");
    };
    c.emit("event", { event: "file-loaded" });
    await expect(supervisor.seek(42)).rejects.toThrow("error running command");
    c.emitProperty("time-pos", 10);
    expect(position(supervisor)).toBe(10);
  });

  it("puts the old position back when the seek is refused", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    const c = clients[0]!;
    c.emitProperty("time-pos", 10);
    c.seek = async () => {
      throw new Error("error running command");
    };
    c.emit("event", { event: "file-loaded" });
    await expect(supervisor.seek(120)).rejects.toThrow();
    expect(position(supervisor)).toBe(10);
  });

  it("does not let a null time-pos release the hold during the open wait", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    const c = clients[0]!;
    const seek = c.seek.bind(c);
    let refused = false;
    c.seek = async (seconds: number, mode = "absolute") => {
      if (!refused) {
        refused = true;
        throw new Error("error running command");
      }
      await seek(seconds, mode);
    };
    const seeking = supervisor.seek(30);
    await new Promise((resolve) => setImmediate(resolve));
    c.emitProperty("time-pos", null);
    expect(position(supervisor)).toBe(30);
    c.emitProperty("time-pos", 0.2);
    expect(position(supervisor)).toBe(30);
    c.emit("event", { event: "file-loaded" });
    await seeking;
  });

  it("does not send an old seek to a track played during the open wait", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    const c = clients[0]!;
    const seek = c.seek.bind(c);
    let refused = false;
    c.seek = async (seconds: number, mode = "absolute") => {
      if (!refused) {
        refused = true;
        throw new Error("error running command");
      }
      await seek(seconds, mode);
    };
    const seeking = supervisor.seek(30);
    await new Promise((resolve) => setImmediate(resolve));
    await supervisor.play("/music/b.flac");
    c.emit("event", { event: "file-loaded" });
    await seeking;
    expect(c.commands.filter((command) => command[0] === "seek")).toHaveLength(0);
    expect(position(supervisor)).toBe(null);
  });

  it("holds the target over the open wait", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    const c = clients[0]!;
    const seek = c.seek.bind(c);
    let refused = false;
    c.seek = async (seconds: number, mode = "absolute") => {
      if (!refused) {
        refused = true;
        throw new Error("error running command");
      }
      await seek(seconds, mode);
    };
    const seeking = supervisor.seek(30);
    await new Promise((resolve) => setImmediate(resolve));
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(Date.now() + 10_000);
    c.emitProperty("time-pos", 0.2);
    expect(position(supervisor)).toBe(30);
    c.emit("event", { event: "file-loaded" });
    await seeking;
    expect(position(supervisor)).toBe(30);
  });
});

/**
 * The audio output (PLAYER-11, DEC-055).
 *
 * The distinction that carries this step is between what the user asked for and
 * what is actually in use. They come apart whenever a fallback happens, and a
 * fallback that overwrote the choice would quietly forget an interface that is
 * merely unplugged for the evening.
 */
describe("audio output (PLAYER-11)", () => {
  it("applies the chosen device and exclusive flag to a running player", async () => {
    const { supervisor, clients } = track(harness({ platform: "win32" }));
    await supervisor.play("/music/a.flac");
    clients[0]!.commands.length = 0;

    await supervisor.setAudioSettings({ device: "wasapi/{interface}", exclusive: true });

    expect(clients[0]!.commands).toContainEqual([
      "set_property",
      "audio-device",
      "wasapi/{interface}",
    ]);
    expect(clients[0]!.commands).toContainEqual(["set_property", "audio-exclusive", true]);
  });

  it("does not start a player just to remember a preference", async () => {
    // Settings are restored at app startup (PLAYER-11), long before anyone
    // presses play. Spawning mpv there would undo PLAYER-03's lazy start.
    const { supervisor, spawnCalls } = track(harness());

    await supervisor.setAudioSettings({ device: "wasapi/{interface}", exclusive: true });

    expect(spawnCalls).toHaveLength(0);
    expect(supervisor.getAudioState()).toMatchObject({
      device: "wasapi/{interface}",
      exclusive: true,
    });
  });

  it("applies the remembered settings to the player that eventually starts", async () => {
    const { supervisor, clients } = track(harness({ platform: "win32" }));
    await supervisor.setAudioSettings({ device: "wasapi/{interface}", exclusive: true });

    await supervisor.play("/music/a.flac");

    expect(clients[0]!.commands).toContainEqual([
      "set_property",
      "audio-device",
      "wasapi/{interface}",
    ]);
    expect(clients[0]!.commands).toContainEqual(["set_property", "audio-exclusive", true]);
  });

  it("keeps the choice when a fallback overrides it", async () => {
    // The interface may be plugged in again in a minute; forgetting the choice
    // because it is asleep would make the user pick it a second time.
    const { supervisor } = track(harness({ platform: "win32" }));
    await supervisor.play("/music/a.flac");
    await supervisor.setAudioSettings({ device: "wasapi/{interface}", exclusive: true });

    await supervisor.setAudioSettings({ exclusive: false }, { remember: false });

    expect(supervisor.getAudioState()).toMatchObject({
      device: "wasapi/{interface}",
      exclusive: true,
      activeDevice: "wasapi/{interface}",
      activeExclusive: false,
    });
  });

  it("tries the user's choice again on the next player start", async () => {
    // A restart is the natural moment to see whether the interface is back.
    const { supervisor, clients, children } = track(harness({ platform: "win32" }));
    await supervisor.play("/music/a.flac");
    await supervisor.setAudioSettings({ device: "wasapi/{interface}", exclusive: true });
    await supervisor.setAudioSettings({ exclusive: false }, { remember: false });

    children.at(-1)?.exit(1);
    await vi.waitFor(() => expect(clients.length).toBeGreaterThan(1));

    await vi.waitFor(() =>
      expect(clients.at(-1)!.commands).toContainEqual([
        "set_property",
        "audio-exclusive",
        true,
      ]),
    );
    expect(supervisor.getAudioState().activeExclusive).toBe(true);
  });

  it("leaves the exclusive flag alone where the platform has no such thing", async () => {
    // Linux has no equivalent; setting it there would be a no-op that reads as
    // a working feature in the snapshot.
    const { supervisor, clients } = track(harness({ platform: "linux" }));
    await supervisor.play("/music/a.flac");
    clients[0]!.commands.length = 0;

    await supervisor.setAudioSettings({ exclusive: true });

    expect(
      clients[0]!.commands.filter((command) => command[1] === "audio-exclusive"),
    ).toHaveLength(0);
    expect(supervisor.getAudioState().exclusiveSupported).toBe(false);
  });

  it("says which platforms can do exclusive output", () => {
    expect(exclusiveOutputSupported("win32")).toBe(true);
    expect(exclusiveOutputSupported("darwin")).toBe(true);
    expect(exclusiveOutputSupported("linux")).toBe(false);
    expect(exclusiveOutputSupported("freebsd")).toBe(false);
  });

  it("lists the devices mpv can see", async () => {
    const { supervisor } = track(harness());

    const devices = await supervisor.listAudioDevices();

    expect(devices).toEqual([
      { name: "auto", description: "Autoselect device" },
      { name: "wasapi/{interface}", description: "Speakers (Focusrite USB Audio)" },
    ]);
  });

  it("falls back to the device name when mpv gives no description", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    clients[0]!.devices = [
      { name: "alsa/hw:0,0", description: "" },
      { name: "", description: "nameless" },
    ] as Array<{ name: string; description: string }>;

    const devices = await supervisor.listAudioDevices();

    // A device with no name cannot be selected and is dropped; one with no
    // description is shown by its name rather than as a blank row.
    expect(devices).toEqual([{ name: "alsa/hw:0,0", description: "alsa/hw:0,0" }]);
  });

  it("survives mpv answering with something that is not a list", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    clients[0]!.devices = null as unknown as Array<{ name: string; description: string }>;

    await expect(supervisor.listAudioDevices()).resolves.toEqual([]);
  });

  it("reports the audio state in the snapshot", async () => {
    const { supervisor } = track(harness({ platform: "win32" }));

    expect(supervisor.getSnapshot().audio).toEqual({
      device: "auto",
      exclusive: false,
      activeDevice: "auto",
      activeExclusive: false,
      exclusiveSupported: true,
    });
  });

  it("tells an audio-output failure apart from a file that will not load", () => {
    // The two arrive as the same `end-file` with the same reason, and only the
    // text tells them apart. One is answered by falling back, the other by
    // skipping the track — swapping them would skip perfectly good music.
    expect(isAudioOutputFailure(AUDIO_INIT_FAILURE)).toBe(true);
    expect(isAudioOutputFailure("Audio output initialization failed")).toBe(true);
    expect(isAudioOutputFailure("loading failed")).toBe(false);
    expect(isAudioOutputFailure(null)).toBe(false);
    expect(isAudioOutputFailure(undefined)).toBe(false);
    expect(isAudioOutputFailure("")).toBe(false);
  });
});

describe("a transport error is heard, not thrown (PLAYER-12)", () => {
  it("listens for the client's errors", async () => {
    // `MpvClient` is an EventEmitter, and an `error` emitted with no listener
    // is an uncaught exception — in Electron's main process, a modal dialog
    // and a dead app. The supervisor is the listener.
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");

    expect(clients[0]!.listenerCount("error")).toBeGreaterThan(0);
    expect(() =>
      clients[0]!.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" })),
    ).not.toThrow();
    expect(supervisor.getSnapshot().status.running).toBe(true);
  });

  it("keeps the reason with mpv's own output", async () => {
    // A player that stopped for a reason nobody recorded is a support ticket
    // with nothing in it.
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");

    clients[0]!.emit("error", new Error("write EPIPE"));

    expect(supervisor.recentOutput().some((line) => line.includes("write EPIPE"))).toBe(true);
  });
});

describe("what mpv says about itself (PLAYER-10)", () => {
  /** Let the stream deliver what was written to it. */
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it("reads stderr, so a talkative player cannot block on a full pipe", async () => {
    // The process is spawned with a stderr *pipe*, and a pipe nobody reads
    // fills up — at which point mpv blocks on its next write and playback stops
    // with it. mpv is quiet while things work and writes a line per file when
    // they do not, so the case that fills the buffer is exactly the one this
    // step is about: a queue pointed at a drive that is not there.
    const { supervisor, children } = track(harness());
    await supervisor.play("/music/a.flac");
    const child = children[0]!;

    // Far more than any pipe buffer would hold.
    for (let index = 0; index < 5_000; index += 1) {
      child.say(`[ffmpeg] file ${index}: No such file or directory\n`);
    }
    await settle();

    expect(child.stderr.readableLength).toBe(0);
  });

  it("keeps a bounded tail of it for diagnostics", async () => {
    const { supervisor, children } = track(harness());
    await supervisor.play("/music/a.flac");
    const child = children[0]!;

    for (let index = 0; index < 200; index += 1) {
      child.say(`line ${index}\n`);
    }
    await settle();

    const output = supervisor.recentOutput();
    expect(output.length).toBe(PLAYER_OUTPUT_LINES);
    // The tail, not the head: the most recent lines are the ones worth having.
    expect(output.at(-1)).toBe("line 199");
  });

  it("joins a line that arrived in pieces", async () => {
    // Stream chunks have nothing to do with line boundaries.
    const { supervisor, children } = track(harness());
    await supervisor.play("/music/a.flac");
    const child = children[0]!;

    child.say("Failed to open ");
    child.say("/music/gone.flac\n");
    await settle();

    expect(supervisor.recentOutput()).toEqual(["Failed to open /music/gone.flac"]);
  });

  it("keeps no blank lines", async () => {
    const { supervisor, children } = track(harness());
    await supervisor.play("/music/a.flac");
    children[0]!.say("\n\n  \nreal line\n");
    await settle();

    expect(supervisor.recentOutput()).toEqual(["real line"]);
  });

  it("survives the stream erroring", async () => {
    // A broken pipe at shutdown must not take the main process down with it.
    const { supervisor, children } = track(harness());
    await supervisor.play("/music/a.flac");

    expect(() => children[0]!.stderr.emit("error", new Error("EPIPE"))).not.toThrow();
    expect(supervisor.getSnapshot().status.running).toBe(true);
  });
});

describe("state from mpv", () => {
  it("mirrors position and duration", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");

    clients[0].emitProperty("duration", 210.5);
    clients[0].emitProperty("time-pos", 12.25);

    const { playback } = supervisor.getSnapshot();
    expect(playback.durationSeconds).toBe(210.5);
    expect(playback.positionSeconds).toBe(12.25);
  });

  it("follows a pause mpv decided on its own", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    clients[0].emitProperty("pause", true);
    expect(supervisor.getSnapshot().playback.paused).toBe(true);
  });

  it("stops being 'playing' when mpv goes idle", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    clients[0].emitProperty("idle-active", true);
    expect(supervisor.getSnapshot().playback.playing).toBe(false);
  });

  it("still says playing after switching tracks mid-play (C8)", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    clients[0].emit("event", { event: "file-loaded" });
    await supervisor.play("/music/b.flac");
    clients[0].emit("end-file", { reason: "stop", playlistEntryId: 1 }); // the replaced file
    clients[0].emit("start-file", { playlistEntryId: 2 });
    clients[0].emit("event", { event: "file-loaded" });
    expect(supervisor.getSnapshot().playback.playing).toBe(true);
  });

  it("still says playing when mpv moves gaplessly to the next entry (C8)", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.enqueue("/music/b.flac");
    clients[0].emit("event", { event: "file-loaded" });
    clients[0].emit("end-file", { reason: "eof", playlistEntryId: 1 });
    clients[0].emit("start-file", { playlistEntryId: 2 });
    clients[0].emit("event", { event: "file-loaded" });
    expect(supervisor.getSnapshot().playback.playing).toBe(true);
  });

  it("does not revive playing on a stray file-loaded after stopPlayback (C8)", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    await supervisor.stopPlayback();
    clients[0].emit("event", { event: "file-loaded" });
    expect(supervisor.getSnapshot().playback.playing).toBe(false);
  });

  it("does not report playing on file-loaded while paused (C8)", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    clients[0].emitProperty("pause", true);
    clients[0].emit("event", { event: "file-loaded" });
    expect(supervisor.getSnapshot().playback.playing).toBe(false);
  });

  it("pushes a last snapshot with playing: true after a switch (C8)", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    clients[0].emit("event", { event: "file-loaded" });
    await supervisor.play("/music/b.flac");
    const seen: boolean[] = [];
    supervisor.onSnapshot((s) => seen.push(s.playback.playing));
    clients[0].emit("end-file", { reason: "stop", playlistEntryId: 1 });
    clients[0].emit("start-file", { playlistEntryId: 2 });
    clients[0].emit("event", { event: "file-loaded" });
    expect(seen.at(-1)).toBe(true);
  });

  it("does not let the replaced file's end-file release the new file's seek wait", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac"); // the client exists once it has played
    clients[0].returnEntryIds = true;
    await supervisor.play("/music/b.flac"); // mpv answers: entry 1
    let calls = 0;
    clients[0].seek = async () => {
      calls += 1;
      if (calls === 1) throw new Error("property unavailable");
    };
    const seeking = supervisor.seek(30);
    clients[0].emit("end-file", { reason: "stop", playlistEntryId: 99 }); // the replaced file
    await settle(10);
    expect(calls).toBe(1); // still waiting on entry 1
    clients[0].emit("event", { event: "file-loaded" });
    await seeking;
    expect(calls).toBe(2);
  });

  it("does not let an older play's entry id stand in for a newer open's", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    clients[0].returnEntryIds = true;
    let openA: () => void = () => undefined;
    let openB: () => void = () => undefined;
    clients[0].loadGates = [
      new Promise<void>((resolve) => (openA = resolve)),
      new Promise<void>((resolve) => (openB = resolve)),
    ];
    const playA = supervisor.play("/music/a2.flac"); // will be entry 1
    await settle(5);
    const playB = supervisor.play("/music/b.flac"); // will be entry 2
    await settle(5);
    openA(); // the older command answers first
    await settle(5);
    openB();
    await Promise.all([playA, playB]);
    let calls = 0;
    clients[0].seek = async () => {
      calls += 1;
      if (calls === 1) throw new Error("property unavailable");
    };
    const seeking = supervisor.seek(30);
    clients[0].emit("end-file", { reason: "stop", playlistEntryId: 1 }); // A, replaced
    await settle(10);
    expect(calls).toBe(1); // still waiting on B's entry 2
    clients[0].emit("event", { event: "file-loaded" });
    await seeking;
    expect(calls).toBe(2);
  });
});

describe("pushing state to listeners", () => {
  it("pushes immediately when something a person would notice changes", async () => {
    const { supervisor } = track(harness());
    const snapshots: unknown[] = [];
    supervisor.onSnapshot((s) => snapshots.push(s));

    await supervisor.play("/music/a.flac");

    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("coalesces position-only updates", async () => {
    // Otherwise the renderer re-renders continuously for the length of every
    // track, to move a progress bar a few pixels.
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    const snapshots: unknown[] = [];
    supervisor.onSnapshot((s) => snapshots.push(s));

    for (let i = 0; i < 20; i += 1) clients[0].emitProperty("time-pos", i);

    expect(snapshots.length).toBeLessThan(20);
  });

  it("still delivers the latest position eventually", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    const seen: Array<number | null> = [];
    supervisor.onSnapshot((s) => seen.push(s.playback.positionSeconds));

    for (let i = 0; i < 10; i += 1) clients[0].emitProperty("time-pos", i);
    await settle(30);

    expect(seen.at(-1)).toBe(9);
  });

  it("stops pushing after unsubscribe", async () => {
    const { supervisor, clients } = track(harness());
    await supervisor.play("/music/a.flac");
    const snapshots: unknown[] = [];
    const unsubscribe = supervisor.onSnapshot((s) => snapshots.push(s));
    unsubscribe();

    clients[0].emitProperty("duration", 100);

    expect(snapshots).toHaveLength(0);
  });

  it("reports the sidecar's health in every snapshot", async () => {
    const { supervisor } = track(harness());
    const snapshots: Array<{ status: { running: boolean } }> = [];
    supervisor.onSnapshot((s) => snapshots.push(s));
    await supervisor.play("/music/a.flac");
    expect(snapshots.at(-1)?.status.running).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Incidents (REPORT-05)
// ---------------------------------------------------------------------------

describe("what the player reports", () => {
  function recorder() {
    const incidents: ProcessIncident[] = [];
    const crumbs: Array<{ category: string; message: string; data?: Record<string, unknown> }> = [];
    const reporter: ProcessReporter = {
      breadcrumb: (category, message, data) => crumbs.push({ category, message, data }),
      incident: (incident) => incidents.push(incident),
    };
    const named = (message: string) => crumbs.filter((c) => c.message === message);
    return { incidents, crumbs, reporter, named };
  }

  it("an exit with a code that a restart recovers from is one event, once the player has stayed up", async () => {
    const { incidents, reporter, named } = recorder();
    // Long enough that the "not yet" check below cannot race the timer, short enough to wait for.
    const { supervisor, children, spawnCalls } = track(harness({ reporter, stableUptimeMs: 400 }));
    await supervisor.play("/music/a.flac");
    children[0].say("[ao/alsa] cannot open device /Users/anna/Music\n");
    await settle(5);

    children[0].exit(3);
    await until(() => spawnCalls.length === 2 && supervisor.getStatus().running);
    // Back, but not yet proven: a loop that restarts cleanly and dies at once is still one incident.
    expect(incidents).toEqual([]);
    await until(() => incidents.length > 0, 3000);

    expect(incidents).toHaveLength(1);
    const [incident] = incidents;
    expect(incident!.process).toBe("player");
    expect(incident!.outcome).toBe("recovered");
    expect(incident!.message).toBe("player exited unexpectedly");
    expect(incident!.data).toMatchObject({ exit_code: 3, signal: null, restarts: 1, exits: 1 });
    expect(incident!.attachment?.filename).toBe("player-output.txt");
    expect(incident!.attachment?.text).toContain("cannot open device");
    expect(named("player exited unexpectedly")).toHaveLength(1);
    expect(named("player restarting")).toHaveLength(1);
  });

  it("three restarts and a give-up are one event, with the reason and the tail", async () => {
    const { incidents, reporter, named } = recorder();
    const { supervisor, children } = track(harness({ reporter, stableUptimeMs: 60_000 }));
    await supervisor.play("/music/a.flac");
    children[0].say("mpv: audio init failed\n");
    await settle(5);

    for (let i = 0; i < 6; i += 1) {
      children.at(-1)?.exit(3);
      await settle(20);
    }

    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outcome).toBe("gave-up");
    expect(incidents[0]!.data).toMatchObject({ exit_code: 3, restarts: 3, exits: 4 });
    expect(incidents[0]!.data.reason).toMatch(/stopped responding/);
    expect(incidents[0]!.attachment?.text).toContain("audio init failed");
    expect(named("player exited unexpectedly")).toHaveLength(4);
    expect(named("player restarting")).toHaveLength(3);
  });

  it("a deliberate stop, and playing again after one, are not reported", async () => {
    const { incidents, crumbs, reporter } = recorder();
    const { supervisor } = track(harness({ reporter, stableUptimeMs: 10 }));
    await supervisor.play("/music/a.flac");
    await supervisor.stop();
    await settle(30);
    await supervisor.play("/music/b.flac");
    await supervisor.dispose();
    await settle(30);

    expect(incidents).toEqual([]);
    expect(crumbs.filter((c) => c.category === "process")).toEqual([]);
  });

  it("an exit that ends by a signal says which", async () => {
    const { incidents, reporter } = recorder();
    const { supervisor, children } = track(harness({ reporter, stableUptimeMs: 10 }));
    await supervisor.play("/music/a.flac");
    children[0].exit(null, "SIGSEGV");
    await settle(60);

    expect(incidents[0]!.data).toMatchObject({ exit_code: null, signal: "SIGSEGV" });
  });

  it("restart loops that overlap are still one give-up event", async () => {
    // Each restarted mpv dies while it is still being connected to: its exit handler fires while the
    // restart that started it is running, and used to start a second loop beside the first.
    const { incidents, reporter } = recorder();
    const { supervisor, children, spawnCalls } = track(
      harness({
        reporter,
        stableUptimeMs: 60_000,
        onSpawn: (child, index) => {
          if (index >= 1) queueMicrotask(() => child.exit(1));
        },
      }),
    );
    await supervisor.play("/music/a.flac");
    children[0].exit(1);
    await until(() => incidents.length > 0);
    await settle(80);

    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.outcome).toBe("gave-up");
    // The first start and three restarts: no loop beside the loop.
    expect(spawnCalls).toHaveLength(4);
    expect(supervisor.getStatus().running).toBe(false);
  });

  it("the tail holds what was still in the pipe when mpv exited", async () => {
    const { incidents, reporter } = recorder();
    const { supervisor, children } = track(harness({ reporter, maxRestartAttempts: 0 }));
    await supervisor.play("/music/a.flac");

    children[0].say("last words before dying\n");
    children[0].exit(1);
    await until(() => incidents.length > 0);

    expect(incidents[0]!.outcome).toBe("gave-up");
    expect(incidents[0]!.attachment?.text).toContain("last words before dying");
  });

  it("keeps a runaway line to a cap, with a marker", async () => {
    const { incidents, reporter } = recorder();
    const { supervisor, children } = track(harness({ reporter, maxRestartAttempts: 0 }));
    await supervisor.play("/music/a.flac");

    children[0].say(`${"z".repeat(5000)}\n`);
    await settle(5);
    children[0].exit(1);
    await until(() => incidents.length > 0);

    const lines = incidents[0]!.attachment!.text.split("\n");
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThan(2100);
    expect(incidents[0]!.attachment!.text).toContain("...[truncated]");
    expect(supervisor.recentOutput().every((l) => l.length < 2100)).toBe(true);
  });

  it("reports the uptime of the process that died, not of an earlier one (its own spawn, not the last good start)", async () => {
    const { incidents, reporter } = recorder();
    const { supervisor, children } = track(
      harness({
        reporter,
        maxRestartAttempts: 1,
        stableUptimeMs: 60_000,
        // The restarted mpv dies at once, before its start has finished.
        onSpawn: (child, index) => {
          if (index === 1) queueMicrotask(() => child.exit(1));
        },
      }),
    );
    await supervisor.play("/music/a.flac");
    await settle(60);

    children[0].exit(1);
    await until(() => incidents.length > 0);

    // Nothing, not the first mpv's 60 ms.
    expect(incidents[0]!.data.uptime_ms).toBeLessThan(40);
  });

  it("an incident open when the app quits is dropped, unsent", async () => {
    const { incidents, reporter } = recorder();
    const { supervisor, children, spawnCalls } = track(harness({ reporter, stableUptimeMs: 20 }));
    await supervisor.play("/music/a.flac");

    children[0].exit(1);
    await until(() => spawnCalls.length === 2);
    await supervisor.dispose();
    await settle(80);

    expect(incidents).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The heartbeat (HARDEN-05)
// ---------------------------------------------------------------------------

describe("the heartbeat (HARDEN-05)", () => {
  /** Fast beats: 8 ms apart, 15 ms to answer, three misses. */
  const beats = { intervalMs: 8, timeoutMs: 15, maxMisses: 3 };

  it("asks idle-active over IPC on its own, and an answer of either kind is an answer", async () => {
    const { supervisor, clients, children } = track(harness({ heartbeat: beats }));
    await supervisor.ensureRunning();
    await until(() => clients[0].idleActiveReads >= 3);
    expect(children).toHaveLength(1);
    expect(clients[0].commands).toContainEqual(["get_property", "idle-active"]);
  });

  it("gives each ask its own request timeout, the heartbeat's", async () => {
    const { supervisor, clients } = track(harness({ heartbeat: beats }));
    await supervisor.ensureRunning();
    await until(() => clients[0].idleActiveReads >= 1);
    expect(clients[0].idleActiveTimeouts[0]).toBe(beats.timeoutMs);
    const { supervisor: other, clients: others } = track(harness({ heartbeat: { intervalMs: 8, maxMisses: 3 } }));
    await other.ensureRunning();
    await until(() => others[0].idleActiveReads >= 1);
    expect(others[0].idleActiveTimeouts[0]).toBe(10_000);
  });

  it("restarts a player that stops answering after three misses in a row, counting toward the bound", async () => {
    const { supervisor, children, clients } = track(harness({ heartbeat: beats }));
    await supervisor.ensureRunning();
    clients[0].silent = true;
    await until(() => children.length === 2);
    expect(children[0].killSignals).toContain("SIGKILL");
    // Quiet again once it is back; the restart used one of the attempts.
    await until(() => supervisor.getStatus().running);
    expect(supervisor.getStatus().restartAttempts).toBe(1);
    expect(clients[1]).toBeDefined();
  });

  it("does not restart after two misses and then an answer", async () => {
    const { supervisor, children, clients } = track(harness({ heartbeat: beats }));
    await supervisor.ensureRunning();
    clients[0].idleActiveScript = ["hang", "hang", "answer", "hang", "hang", "answer"];
    await until(() => clients[0].idleActiveReads >= 7);
    expect(children).toHaveLength(1);
    expect(children[0].killSignals).toEqual([]);
  });

  it("reports a stopped player once per session, and tells it as a stop, not a signal", async () => {
    const incidents: ProcessIncident[] = [];
    const crumbs: string[] = [];
    const reporter: ProcessReporter = {
      incident: (incident) => incidents.push(incident),
      breadcrumb: (_category, message) => crumbs.push(message),
    };
    const { supervisor, children, clients } = track(
      harness({ reporter, heartbeat: beats, stableUptimeMs: 30, maxRestartAttempts: 5 }),
    );
    await supervisor.ensureRunning();
    clients[0].silent = true;
    await until(() => children.length === 2);
    await until(() => incidents.length === 1, 3000);
    expect(incidents[0].data.signal).toBe("heartbeat");

    // A second stop in the same session: restarted, but not reported again.
    await until(() => clients.length === 2 && supervisor.getStatus().running);
    clients[1].silent = true;
    await until(() => children.length === 3);
    await until(() => crumbs.includes("player stopped answering"), 3000);
    await settle(60);
    expect(incidents).toHaveLength(1);
  });

  it("stops asking once the player is stopped", async () => {
    const { supervisor, clients } = track(harness({ heartbeat: beats }));
    await supervisor.ensureRunning();
    await supervisor.stop();
    const reads = clients[0].idleActiveReads;
    await settle(60);
    expect(clients[0].idleActiveReads).toBe(reads);
  });
});
