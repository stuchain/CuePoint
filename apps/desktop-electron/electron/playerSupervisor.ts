import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import {
  MPV_OBSERVED_PROPERTIES,
  MpvClient,
  buildMpvArgs,
  createMpvSocketPath,
  type MpvEndFile,
  type MpvStartFile,
} from "./mpvClient";
import {
  resolvePlayerBinary,
  playerUnavailableReason,
  type ResolvePlayerBinaryOptions,
} from "./playerLaunch";

/**
 * Owns the mpv process and mirrors its state (PLAYER-03, DEC-049, DEC-050).
 *
 * `EngineSupervisor` is the model — spawn a bundled binary, restart it a
 * bounded number of times with backoff, expose a status object the UI can
 * render, and fail visibly rather than silently — but two things are
 * deliberately different:
 *
 * **It starts lazily.** The engine is required for CuePoint to do anything; the
 * player is not. A session where nobody presses play never spawns a second
 * process, which is also what makes DEC-053's "the bar appears on first play"
 * honest rather than cosmetic.
 *
 * **It knows nothing about Electron.** `spawn` and the client are injectable
 * and no Electron module is imported, so the restart policy and the state
 * machine are testable without an Electron runtime. `EngineSupervisor` reaches
 * `app.isPackaged` through `engineLaunch`, which is exactly why it has no unit
 * tests; repeating that here would repeat the consequence.
 *
 * What it is *not*: a queue. It plays the file it is given and reports what
 * happened. Deciding what plays next is PLAYER-04's, per DEC-050.
 */

/**
 * How hard CuePoint tries to bring a dead player back.
 *
 * The same shape as the engine's bounded policy (DEC-028) and the same reason:
 * unlimited restarts hide a crash-looping process behind a flickering status.
 * Declared here rather than imported because `engineSupervisor` pulls in
 * Electron, which would drag this module's tests back into needing a runtime.
 */
export const MAX_PLAYER_RESTART_ATTEMPTS = 3;
export const PLAYER_RESTART_BACKOFF_MS = [1000, 2000, 4000];

/** How long to wait for mpv to create its socket before giving up. */
export const PLAYER_CONNECT_ATTEMPTS = 25;
export const PLAYER_CONNECT_RETRY_MS = 100;

/** How long a polite shutdown gets before the process is killed. */
export const PLAYER_QUIT_TIMEOUT_MS = 2000;

/**
 * How long mpv must survive before a crash counts as a fresh problem.
 *
 * The attempt budget is not reset just because a start *succeeded*. mpv that
 * launches cleanly and then dies a moment later — failing to open an audio
 * device, say — starts successfully every single time, so resetting on start
 * would restart it forever and reproduce exactly the flickering, unbounded
 * loop the budget exists to prevent. Surviving this long is evidence it really
 * worked; anything shorter is a crash loop.
 */
/**
 * The audio output, as the user set it and as it actually is (PLAYER-11).
 *
 * Two pairs, not one, because they come apart: exclusive output can fail
 * because another application holds the device, and a chosen device can vanish
 * when its interface is unplugged. DEC-055 requires that neither is fatal, so
 * the player falls back — and a fallback that overwrote the user's choice would
 * quietly forget an interface that is merely asleep. What the user asked for is
 * kept; what is in use right now is reported alongside it.
 */
export interface AudioSettings {
  /** An mpv device name, or "auto" for the system default. */
  device: string;
  exclusive: boolean;
}

export interface AudioState extends AudioSettings {
  /** The device actually in use, after any fallback. */
  activeDevice: string;
  /** Whether exclusive output is actually in force. */
  activeExclusive: boolean;
  /**
   * Whether this OS can do exclusive output at all.
   *
   * Linux has no equivalent (DEC-055), and a control that lies is worse than a
   * control that is disabled with a reason — so the renderer is told rather
   * than left to guess from a platform string it should not have.
   */
  exclusiveSupported: boolean;
}

export interface AudioDevice {
  name: string;
  description: string;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { device: "auto", exclusive: false };

/** The device name that means "whatever the system is using". */
export const SYSTEM_DEFAULT_DEVICE = "auto";

/**
 * mpv's own words when it cannot open the audio output (PLAYER-11).
 *
 * Verified against the bundled build: a device that does not exist produces
 * `{"event":"end-file","reason":"error","file_error":"audio output
 * initialization failed"}`. It is deliberately *not* the same text as a file
 * that will not load ("loading failed"), which is what lets PLAYER-10's
 * skip-and-count and this step's fall-back-and-retry stay apart.
 */
export const AUDIO_INIT_FAILURE = "audio output initialization failed";

/**
 * Whether this platform has an exclusive-output mode at all (DEC-055).
 *
 * WASAPI exclusive on Windows and hog mode on macOS; Linux has no equivalent,
 * and PipeWire/PulseAudio deliberately do not offer one. The control is
 * disabled there with a reason rather than offered and quietly ignored.
 */
export function exclusiveOutputSupported(platform: string): boolean {
  return platform === "win32" || platform === "darwin";
}

/** Whether a failure reason from mpv is the audio output rather than the file. */
export function isAudioOutputFailure(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return reason.toLowerCase().includes("audio output");
}

/** How many lines of mpv's own output are kept for diagnostics. */
export const PLAYER_OUTPUT_LINES = 50;

export const PLAYER_STABLE_UPTIME_MS = 10_000;

/**
 * Minimum gap between pushes caused only by playback position.
 *
 * mpv reports `time-pos` continuously. Forwarding every change would push IPC
 * traffic at the renderer for the entire duration of every track, to move a
 * progress bar a few pixels. Anything that actually changes — paused, the
 * track, the sidecar's health — bypasses this and pushes at once.
 */
export const POSITION_PUSH_INTERVAL_MS = 250;

export interface PlayerStatus {
  /** A player binary exists and could be started. */
  available: boolean;
  /** The process is running right now. */
  running: boolean;
  /** A bounded restart is in progress (the status strip says "reconnecting"). */
  reconnecting: boolean;
  restartAttempts: number;
  /** Set when the player cannot be used, phrased for a person. */
  error?: string;
  /** Where the binary came from, for diagnostics. */
  source?: string;
}

export interface PlaybackState {
  /** The file mpv was last asked to play, or null. */
  filePath: string | null;
  playing: boolean;
  paused: boolean;
  positionSeconds: number | null;
  durationSeconds: number | null;
  volume: number;
  muted: boolean;
}

export interface PlayerSnapshot {
  status: PlayerStatus;
  playback: PlaybackState;
  /** The output settings and what they actually resolved to (PLAYER-11). */
  audio: AudioState;
}

/** Playback failed for a reason the user should be told about. */
export class PlayerUnavailableError extends Error {
  readonly code = "player-unavailable";
  constructor(message: string) {
    super(message);
    this.name = "PlayerUnavailableError";
  }
}

export interface PlayerSupervisorOptions extends Partial<ResolvePlayerBinaryOptions> {
  /** Injected in tests. */
  spawn?: typeof nodeSpawn;
  createClient?: (socketPath: string) => MpvClient;
  createSocketPath?: () => string;
  /** Extra mpv arguments (PLAYER-11 will supply audio device options). */
  mpvArgs?: readonly string[];
  connectAttempts?: number;
  connectRetryMs?: number;
  positionPushIntervalMs?: number;
  restartBackoffMs?: readonly number[];
  maxRestartAttempts?: number;
  stableUptimeMs?: number;
}

type SnapshotListener = (snapshot: PlayerSnapshot) => void;
type EndFileListener = (info: MpvEndFile) => void;
type StartFileListener = (info: MpvStartFile) => void;
type IdleListener = () => void;

const IDLE_PLAYBACK: PlaybackState = {
  filePath: null,
  playing: false,
  paused: false,
  positionSeconds: null,
  durationSeconds: null,
  volume: 100,
  muted: false,
};

export class PlayerSupervisor {
  private child: ChildProcess | null = null;
  private client: MpvClient | null = null;
  private starting: Promise<void> | null = null;
  private stopping = false;
  private disposed = false;

  private restartAttempts = 0;
  private reconnecting = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private gaveUpReason: string | null = null;
  /** When the current process last became usable, for the stable-uptime rule. */
  private startedAt = 0;

  private playback: PlaybackState = { ...IDLE_PLAYBACK };
  private lastPushAt = 0;
  private pushTimer: NodeJS.Timeout | null = null;

  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly endFileListeners = new Set<EndFileListener>();
  private readonly startFileListeners = new Set<StartFileListener>();
  private readonly idleListeners = new Set<IdleListener>();
  /** mpv's own `idle-active`: it has nothing loaded and is playing nothing. */
  private idleActive = false;
  /** What the user asked for; see `AudioState`. */
  private audio: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  /** What is actually in use, which a fallback can pull away from it. */
  private activeAudio: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  /** The tail of mpv's own diagnostics; see `drainOutput`. */
  private output: string[] = [];
  private outputTail = "";

  private readonly spawnFn: typeof nodeSpawn;
  private readonly clientFactory: (socketPath: string) => MpvClient;
  private readonly socketPathFactory: () => string;

  constructor(private readonly options: PlayerSupervisorOptions = {}) {
    this.spawnFn = options.spawn ?? nodeSpawn;
    this.clientFactory =
      options.createClient ?? ((socketPath) => new MpvClient({ socketPath }));
    this.socketPathFactory = options.createSocketPath ?? (() => createMpvSocketPath());
  }

  // -------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------

  /** Where the binary is, or null. Recomputed each call so a fetch mid-session is noticed. */
  private locate() {
    return resolvePlayerBinary({
      packaged: this.options.packaged ?? false,
      resourcesPath: this.options.resourcesPath,
      repoRoot: this.options.repoRoot,
      platform: this.options.platform,
      arch: this.options.arch,
      env: this.options.env,
      exists: this.options.exists,
    });
  }

  getStatus(): PlayerStatus {
    const binary = this.locate();
    if (!binary) {
      return {
        available: false,
        running: false,
        reconnecting: false,
        restartAttempts: this.restartAttempts,
        error: playerUnavailableReason({
          packaged: this.options.packaged ?? false,
          platform: this.options.platform,
          arch: this.options.arch,
        }),
      };
    }
    return {
      available: true,
      running: this.child !== null && this.client !== null,
      reconnecting: this.reconnecting,
      restartAttempts: this.restartAttempts,
      error: this.gaveUpReason ?? undefined,
      source: binary.source,
    };
  }

  getSnapshot(): PlayerSnapshot {
    return {
      status: this.getStatus(),
      playback: { ...this.playback },
      audio: this.getAudioState(),
    };
  }

  /** Subscribe to state pushes. Returns an unsubscribe function. */
  onSnapshot(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  /** Subscribe to end-of-file, which PLAYER-04 advances the queue on. */
  onEndFile(listener: EndFileListener): () => void {
    this.endFileListeners.add(listener);
    return () => this.endFileListeners.delete(listener);
  }

  /**
   * Subscribe to mpv starting a playlist entry.
   *
   * How the queue learns that mpv advanced *by itself* into a preloaded entry,
   * which is what gapless playback looks like from out here (DEC-056).
   */
  onStartFile(listener: StartFileListener): () => void {
    this.startFileListeners.add(listener);
    return () => this.startFileListeners.delete(listener);
  }

  /**
   * Subscribe to mpv running out of things to play (PLAYER-10).
   *
   * `idle-active` going true is the only *definitive* statement mpv makes that
   * it has stopped and will not start anything else on its own. PLAYER-10 needs
   * it because a file that fails to load is normally walked past by mpv into
   * the preloaded entry — but when there is no preloaded entry, or the append
   * lost the race with the failure, mpv simply goes idle and playback would
   * stall silently in the middle of a queue.
   */
  onIdle(listener: IdleListener): () => void {
    this.idleListeners.add(listener);
    return () => this.idleListeners.delete(listener);
  }

  /**
   * Whether mpv is sitting with nothing to play, right now.
   *
   * The event above is an edge and this is the level, and both are needed:
   * `end-file` and `idle-active` are separate messages on the same socket and
   * arrive in either order. A listener that only watched the edge would miss
   * the case where mpv reported itself idle *before* the failure that explains
   * it — and an observed property only fires on change, so no second edge ever
   * comes to correct it.
   */
  get isIdle(): boolean {
    return this.idleActive;
  }

  /** The audio output as asked for and as it is (PLAYER-11, DEC-055). */
  getAudioState(): AudioState {
    return {
      device: this.audio.device,
      exclusive: this.audio.exclusive,
      activeDevice: this.activeAudio.device,
      activeExclusive: this.activeAudio.exclusive,
      exclusiveSupported: exclusiveOutputSupported(this.options.platform ?? process.platform),
    };
  }

  /**
   * The devices mpv can see right now (DEC-055).
   *
   * Asked for rather than cached: interfaces are plugged in and unplugged while
   * the app runs, and a picker showing last hour's list is a picker that offers
   * a device which is no longer there. Starts the player if it is not running,
   * because only mpv can answer.
   */
  async listAudioDevices(): Promise<AudioDevice[]> {
    await this.ensureRunning();
    const client = this.requireClient();
    const devices = await client.getAudioDeviceList();
    if (!Array.isArray(devices)) return [];
    return devices
      .filter(
        (device): device is AudioDevice =>
          typeof device?.name === "string" && device.name !== "",
      )
      .map((device) => ({
        name: device.name,
        description:
          typeof device.description === "string" && device.description !== ""
            ? device.description
            : device.name,
      }));
  }

  /**
   * Choose the output, or fall back to it.
   *
   * `applyNow` distinguishes the two callers. The user choosing a device is a
   * choice and is remembered; the controller falling back because the device
   * is gone is not, and must not overwrite what the user asked for — the
   * interface may be plugged in again in a minute.
   */
  async setAudioSettings(
    settings: Partial<AudioSettings>,
    options: { remember?: boolean } = {},
  ): Promise<void> {
    const remember = options.remember ?? true;
    const next: AudioSettings = {
      device: settings.device ?? this.activeAudio.device,
      exclusive: settings.exclusive ?? this.activeAudio.exclusive,
    };
    if (remember) this.audio = { ...next };
    this.activeAudio = { ...next };
    this.push(true);
    // Applied to a player that is not running would start one for nothing:
    // the settings are put back by `restoreAudio` when it next starts.
    if (!this.client) return;
    await this.applyAudio(this.client);
  }

  /**
   * The last few lines mpv wrote about itself.
   *
   * PLAYER-10 asks for a failure to be logged, and this is where the player's
   * own words about it are kept. The renderer never sees them: a user is told
   * "could not play that track", and the reason mpv gave for *why* belongs in
   * diagnostics rather than in a toast.
   */
  recentOutput(): readonly string[] {
    return [...this.output];
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start mpv if it is not already running.
   *
   * Concurrent callers share one attempt — two rapid double-clicks must not
   * race two processes onto two sockets.
   */
  async ensureRunning(): Promise<void> {
    if (this.disposed) throw new PlayerUnavailableError("The player has been shut down.");
    if (this.child && this.client) return;
    if (this.starting) return this.starting;

    this.starting = this.start().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async start(): Promise<void> {
    const binary = this.locate();
    if (!binary) {
      throw new PlayerUnavailableError(
        playerUnavailableReason({
          packaged: this.options.packaged ?? false,
          platform: this.options.platform,
          arch: this.options.arch,
        }),
      );
    }

    const socketPath = this.socketPathFactory();
    const args = buildMpvArgs(socketPath, this.options.mpvArgs ?? []);

    let child: ChildProcess;
    try {
      child = this.spawnFn(binary.path, args, {
        cwd: path.dirname(binary.path),
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      throw new PlayerUnavailableError(
        `Could not start the audio player at ${binary.path}: ${(error as Error).message}`,
      );
    }

    this.drainOutput(child);

    // A spawn that fails asynchronously (ENOENT) reports through `error`.
    let spawnError: Error | null = null;
    child.once("error", (error: Error) => {
      spawnError = error;
    });

    child.once("exit", () => {
      if (this.child !== child) return; // superseded by a restart
      this.child = null;
      this.client?.close();
      this.client = null;
      this.markStopped();
      if (this.stopping || this.disposed) return;
      const stableFor = this.options.stableUptimeMs ?? PLAYER_STABLE_UPTIME_MS;
      if (this.startedAt > 0 && Date.now() - this.startedAt >= stableFor) {
        // It ran properly for a while, so this is a new problem rather than a
        // continuation of a crash loop: give it a full budget again.
        this.restartAttempts = 0;
        this.gaveUpReason = null;
      }
      void this.scheduleRestart();
    });

    this.child = child;

    const client = this.clientFactory(socketPath);
    try {
      await this.connectWithRetry(client, () => spawnError);
    } catch (error) {
      this.child = null;
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      throw new PlayerUnavailableError(
        `The audio player did not start: ${(error as Error).message}`,
      );
    }

    this.client = client;
    client.on("close", () => {
      if (this.client !== client) return;
      this.client = null;
    });
    client.on("start-file", (info) => {
      for (const listener of this.startFileListeners) listener(info);
    });
    client.on("end-file", (info) => {
      this.playback = { ...this.playback, playing: false };
      this.push(true);
      for (const listener of this.endFileListeners) listener(info);
    });

    await this.observeState(client);
    await this.restoreAudio(client);
    this.startedAt = Date.now();
    this.gaveUpReason = null;
    this.push(true);
  }

  /**
   * Connect to mpv's socket, which does not exist the instant the process does.
   *
   * Retried rather than slept on: a fixed sleep is either too short on a loaded
   * machine or wasted time on a fast one.
   */
  private async connectWithRetry(client: MpvClient, spawnError: () => Error | null): Promise<void> {
    const attempts = this.options.connectAttempts ?? PLAYER_CONNECT_ATTEMPTS;
    const retryMs = this.options.connectRetryMs ?? PLAYER_CONNECT_RETRY_MS;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const failure = spawnError();
      if (failure) throw failure;
      try {
        await client.connect();
        return;
      } catch (error) {
        lastError = error as Error;
        await new Promise((resolve) => setTimeout(resolve, retryMs));
      }
    }
    throw lastError ?? new Error("could not connect to the player socket");
  }

  private async observeState(client: MpvClient): Promise<void> {
    for (const name of MPV_OBSERVED_PROPERTIES) {
      await client
        .observeProperty(name, (value) => this.applyProperty(name, value))
        .catch(() => {
          // A property this build does not know about must not stop playback;
          // the transport simply will not update that field.
        });
    }
  }

  /**
   * Put the volume and mute back after a start.
   *
   * A fresh mpv comes up at its own defaults. Without this, a restart after a
   * crash would silently undo whatever the user had set, and a volume set
   * before the first track ever played would be shown in the bar and not
   * actually be true.
   */
  private async restoreAudio(client: MpvClient): Promise<void> {
    if (this.playback.volume !== IDLE_PLAYBACK.volume) {
      await client.setVolume(this.playback.volume).catch(() => undefined);
    }
    if (this.playback.muted) await client.setMuted(true).catch(() => undefined);
    // A fresh player gets what the *user* asked for, not what a fallback
    // settled on: a restart is the natural moment to try the interface again.
    this.activeAudio = { ...this.audio };
    await this.applyAudio(client);
  }

  /**
   * Push the output settings into mpv.
   *
   * Never fatal. mpv takes a device name it has never heard of without
   * complaint (verified against the bundled build), and finds out at the next
   * `loadfile` — which is the failure the controller's fallback answers. A
   * throw here would instead take down whatever asked for the change.
   */
  private async applyAudio(client: MpvClient): Promise<void> {
    await client.setAudioDevice(this.activeAudio.device).catch(() => undefined);
    if (exclusiveOutputSupported(this.options.platform ?? process.platform)) {
      await client.setAudioExclusive(this.activeAudio.exclusive).catch(() => undefined);
    }
  }

  /**
   * Read mpv's stderr and keep the tail of it.
   *
   * The reading is not optional. The process is spawned with a stderr *pipe*,
   * and a pipe nobody reads fills up — at which point mpv blocks on its next
   * write and the player stops responding, taking playback with it. mpv is
   * quiet while things work and writes a line per file when they do not, so
   * the case that fills 64 KB of pipe buffer is precisely the one this step is
   * about: a queue pointed at a drive that is not there.
   *
   * What is kept is bounded for the same reason: a tail, not a transcript.
   */
  private drainOutput(child: ChildProcess): void {
    const stream = child.stderr;
    if (!stream) return;
    stream.setEncoding("utf-8");
    stream.on("data", (chunk: string) => {
      const text = this.outputTail + chunk;
      const lines = text.split(/\r?\n/);
      // A chunk can end mid-line; hold the remainder for the next one.
      this.outputTail = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim() === "") continue;
        this.output.push(line);
      }
      if (this.output.length > PLAYER_OUTPUT_LINES) {
        this.output = this.output.slice(-PLAYER_OUTPUT_LINES);
      }
    });
    // A broken pipe on shutdown is not an error worth surfacing, but an
    // unhandled one on a stream would take the process down.
    stream.on("error", () => undefined);
  }

  private applyProperty(name: string, value: unknown): void {
    let significant = false;
    let idle = false;
    switch (name) {
      case "time-pos":
        this.playback = {
          ...this.playback,
          positionSeconds: typeof value === "number" ? value : null,
        };
        break;
      case "duration":
        this.playback = {
          ...this.playback,
          durationSeconds: typeof value === "number" ? value : null,
        };
        significant = true;
        break;
      case "pause": {
        const paused = value === true;
        significant = paused !== this.playback.paused;
        this.playback = { ...this.playback, paused, playing: !paused && this.playback.filePath !== null };
        break;
      }
      case "idle-active":
        this.idleActive = value === true;
        if (value === true) {
          this.playback = { ...this.playback, playing: false };
          significant = true;
          // After the state is settled, so a listener that reacts by playing
          // something sees an idle player rather than a half-updated one.
          idle = true;
        }
        break;
      default:
        break;
    }
    this.push(significant);
    if (idle) {
      for (const listener of this.idleListeners) listener();
    }
  }

  private markStopped(): void {
    this.playback = { ...this.playback, playing: false, positionSeconds: null };
    this.push(true);
  }

  /**
   * Bring a crashed player back, up to a bounded number of attempts.
   *
   * Playback is not resumed: the queue lives in PLAYER-04 and, per DEC-014,
   * CuePoint does not restore a position. Coming back ready to play is the
   * goal, not pretending the crash did not happen.
   */
  private async scheduleRestart(): Promise<void> {
    const max = this.options.maxRestartAttempts ?? MAX_PLAYER_RESTART_ATTEMPTS;
    const backoff = this.options.restartBackoffMs ?? PLAYER_RESTART_BACKOFF_MS;

    if (this.restartAttempts >= max) {
      this.reconnecting = false;
      this.gaveUpReason = "The audio player stopped responding. Play a track to try again.";
      this.push(true);
      return;
    }

    const delay = backoff[this.restartAttempts] ?? backoff.at(-1) ?? 4000;
    this.restartAttempts += 1;
    this.reconnecting = true;
    this.push(true);

    await new Promise<void>((resolve) => {
      this.restartTimer = setTimeout(resolve, delay);
      this.restartTimer.unref?.();
    });
    this.restartTimer = null;
    if (this.stopping || this.disposed) {
      this.reconnecting = false;
      return;
    }

    try {
      await this.start();
      this.reconnecting = false;
      // Deliberately *not* resetting the attempt counter here. Starting is not
      // the same as working; the counter is cleared when the process proves
      // itself by surviving (see the exit handler) or when the user plays
      // something, which is a fresh deliberate act.
      this.push(true);
    } catch {
      this.reconnecting = false;
      await this.scheduleRestart();
    }
  }

  /** Stop mpv: ask politely, then insist. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.reconnecting = false;

    const child = this.child;
    const client = this.client;
    this.child = null;
    this.client = null;

    if (client) {
      // `quit` lets mpv release the audio device itself, which matters most in
      // exclusive mode (DEC-055) where a killed process can leave the device
      // held.
      await client.command(["quit"]).catch(() => undefined);
      client.close();
    }

    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        child.once("exit", finish);
        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            /* already gone */
          }
          finish();
        }, PLAYER_QUIT_TIMEOUT_MS);
        timer.unref?.();
        try {
          child.kill();
        } catch {
          finish();
        }
      });
    }

    this.playback = { ...IDLE_PLAYBACK, volume: this.playback.volume, muted: this.playback.muted };
    this.stopping = false;
    this.push(true);
  }

  /** Shut down for good. Called on app quit; the supervisor is unusable after. */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    await this.stop();
    this.snapshotListeners.clear();
    this.endFileListeners.clear();
    this.startFileListeners.clear();
    this.idleListeners.clear();
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  /**
   * Play one file.
   *
   * Starting the player and playing a file are different failures with
   * different messages — the risk PLAYER-03 was flagged for. A missing binary
   * throws `PlayerUnavailableError` here and now; a file that will not decode
   * arrives later as an `end-file` event, which is PLAYER-10's to report.
   */
  async play(filePath: string): Promise<number | null> {
    await this.ensureRunning();
    const client = this.requireClient();
    this.restartAttempts = 0;
    this.playback = {
      ...this.playback,
      filePath,
      playing: true,
      paused: false,
      positionSeconds: null,
      durationSeconds: null,
    };
    // Not idle any more, whatever mpv last said: it is about to play this or
    // fail it. Waiting for the property to catch up would leave a window in
    // which a failure looks like it arrived at an already-idle player.
    this.idleActive = false;
    this.push(true);
    // `replace` clears mpv's playlist, so any preloaded entry goes with it —
    // verified against the bundled build, where playlist-count returns to 1.
    const entryId = await client.loadFile(filePath, "replace");
    await client.setPaused(false);
    return entryId;
  }

  /**
   * Append a file to mpv's playlist so it can start without a gap.
   *
   * This is what DEC-056 actually requires: `--gapless-audio` only avoids a gap
   * *within* mpv's own playlist, so the next track has to be there before the
   * current one ends. Loading it on `end-file` instead would put a gap between
   * every pair of tracks, which is the thing the decision rules out.
   */
  async enqueue(filePath: string): Promise<number | null> {
    const client = this.requireClient();
    // `append`, deliberately not `append-play`. `append-play` starts playback
    // when mpv happens to be idle, which sounds like useful robustness and is
    // actually a way to start music nobody asked for: after a queue finishes,
    // mpv is idle, and any later queue edit would preload — and therefore
    // begin playing — the first track. Preloading is for continuing playback
    // that is already happening; the controller decides when to *start*.
    return client.loadFile(filePath, "append");
  }

  /** True when mpv is up and can take playlist commands. */
  get isRunning(): boolean {
    return this.child !== null && this.client !== null;
  }

  /** The file currently loaded, for the controller's bookkeeping. */
  get currentFilePath(): string | null {
    return this.playback.filePath;
  }

  async pause(): Promise<void> {
    await this.setPaused(true);
  }

  async resume(): Promise<void> {
    await this.setPaused(false);
  }

  async togglePause(): Promise<void> {
    await this.setPaused(!this.playback.paused);
  }

  private async setPaused(paused: boolean): Promise<void> {
    const client = this.requireClient();
    await client.setPaused(paused);
    this.playback = { ...this.playback, paused, playing: !paused && this.playback.filePath !== null };
    this.push(true);
  }

  async seek(seconds: number): Promise<void> {
    const client = this.requireClient();
    await client.seek(seconds, "absolute");
    this.playback = { ...this.playback, positionSeconds: seconds };
    this.push(true);
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, volume));
    this.playback = { ...this.playback, volume: clamped };
    this.push(true);
    if (this.client) await this.client.setVolume(clamped);
  }

  async setMuted(muted: boolean): Promise<void> {
    this.playback = { ...this.playback, muted };
    this.push(true);
    if (this.client) await this.client.setMuted(muted);
  }

  /** Stop playback without shutting the process down. */
  async stopPlayback(): Promise<void> {
    const client = this.client;
    this.playback = { ...IDLE_PLAYBACK, volume: this.playback.volume, muted: this.playback.muted };
    this.push(true);
    if (client) await client.stop().catch(() => undefined);
  }

  private requireClient(): MpvClient {
    if (!this.client) {
      throw new PlayerUnavailableError("The audio player is not running.");
    }
    return this.client;
  }

  // -------------------------------------------------------------------------
  // Pushing state
  // -------------------------------------------------------------------------

  /**
   * Publish a snapshot, coalescing position-only updates.
   *
   * `significant` means something a person would notice — paused, a new track,
   * the sidecar's health — and goes out immediately. Position alone is
   * throttled, because otherwise the renderer re-renders continuously for the
   * length of every track.
   */
  private push(significant: boolean): void {
    if (this.snapshotListeners.size === 0) return;
    const interval = this.options.positionPushIntervalMs ?? POSITION_PUSH_INTERVAL_MS;
    const now = Date.now();

    if (significant || now - this.lastPushAt >= interval) {
      if (this.pushTimer) {
        clearTimeout(this.pushTimer);
        this.pushTimer = null;
      }
      this.lastPushAt = now;
      const snapshot = this.getSnapshot();
      for (const listener of this.snapshotListeners) listener(snapshot);
      return;
    }

    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.lastPushAt = Date.now();
      const snapshot = this.getSnapshot();
      for (const listener of this.snapshotListeners) listener(snapshot);
    }, interval - (now - this.lastPushAt));
    this.pushTimer.unref?.();
  }
}
