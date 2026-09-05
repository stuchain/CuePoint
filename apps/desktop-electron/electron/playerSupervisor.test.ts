import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerSupervisor, PlayerUnavailableError } from "./playerSupervisor";

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

  kill(signal?: NodeJS.Signals): boolean {
    this.killSignals.push(signal);
    this.killed = true;
    // A real child exits asynchronously after a signal.
    setTimeout(() => this.exit(0), 0);
    return true;
  }

  /** Simulate the process ending, as a crash or after a kill. */
  exit(code: number): void {
    if (this.exitCode !== null) return;
    this.exitCode = code;
    this.emit("exit", code, null);
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

  async loadFile(file: string, mode = "replace"): Promise<void> {
    this.commands.push(["loadfile", file, mode]);
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
  async setVolume(volume: number): Promise<void> {
    this.commands.push(["set_property", "volume", volume]);
  }
  async setMuted(muted: boolean): Promise<void> {
    this.commands.push(["set_property", "mute", muted]);
  }
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
  } = {},
): Harness {
  const children: FakeChild[] = [];
  const clients: FakeClient[] = [];
  const spawnCalls: Array<{ binary: string; args: string[] }> = [];

  const supervisor = new PlayerSupervisor({
    packaged: false,
    repoRoot: "/repo",
    platform: "linux",
    arch: "x64",
    env: {},
    exists: overrides.exists ?? (() => true),
    connectAttempts: 3,
    connectRetryMs: 1,
    restartBackoffMs: [1, 1, 1],
    maxRestartAttempts: overrides.maxRestartAttempts,
    stableUptimeMs: overrides.stableUptimeMs,
    positionPushIntervalMs: 5,
    createSocketPath: () => `/tmp/sock-${children.length}`,
    spawn: ((binary: string, args: string[]) => {
      if (overrides.spawnThrows) throw overrides.spawnThrows;
      spawnCalls.push({ binary, args });
      const child = new FakeChild();
      children.push(child);
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
