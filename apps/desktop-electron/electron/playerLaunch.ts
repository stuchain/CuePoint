import fs from "node:fs";
import path from "node:path";

/**
 * Where the mpv binary is (PLAYER-03, DEC-049).
 *
 * The counterpart of `engineLaunch.ts`, with one deliberate difference: this
 * module imports nothing from Electron. `engineLaunch` reads `app.isPackaged`
 * at module scope, which is why it — and everything importing it — cannot be
 * loaded in a unit test. Here the caller passes `packaged` in, so every path
 * this resolves can be checked on any platform without an Electron runtime.
 *
 * Three sources, in order:
 *
 * 1. `CUEPOINT_MPV_PATH`, honoured in packaged builds too, not just in
 *    development. On Linux CuePoint bundles no mpv at all (PLAYER-01 pins none),
 *    so for those users the override is not a convenience — it is the only way
 *    to have audio.
 * 2. The bundled sidecar in a packaged app: `<resources>/player/`.
 * 3. The fetched sidecar in a checkout:
 *    `apps/desktop-electron/resources/player/<os>-<arch>/`.
 */

/** `${os}-${arch}` as electron-builder names them, matching PLAYER-01's layout. */
export function playerPlatformDir(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string | null {
  const os = platform === "win32" ? "win" : platform === "darwin" ? "mac" : platform === "linux" ? "linux" : null;
  if (!os) return null;
  const cpu = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : null;
  if (!cpu) return null;
  return `${os}-${cpu}`;
}

/**
 * The executable's path inside an install directory.
 *
 * macOS ships an application bundle rather than a bare binary, so the
 * executable sits several levels down. Getting this wrong produces a
 * "player unavailable" that looks like a packaging failure.
 */
export function playerBinaryRelativePath(platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return "mpv.exe";
  if (platform === "darwin") return path.join("mpv.app", "Contents", "MacOS", "mpv");
  return "mpv";
}

export type PlayerBinarySource = "env" | "bundled" | "development";

export interface ResolvedPlayerBinary {
  path: string;
  source: PlayerBinarySource;
}

export interface ResolvePlayerBinaryOptions {
  packaged: boolean;
  /** `process.resourcesPath` in a packaged app. */
  resourcesPath?: string;
  /** Repository root, for a development checkout. */
  repoRoot?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  env?: NodeJS.ProcessEnv;
  /** Injected in tests so resolution can be checked without a real file. */
  exists?: (candidate: string) => boolean;
}

/**
 * Find a usable mpv, or `null` when there is none.
 *
 * `null` is a supported outcome, not an error: a Linux build, or a checkout
 * where nobody ran the fetch script, simply has no player. The app must still
 * run (PLAYER-01's cross-cutting fact 4), so this reports absence rather than
 * throwing.
 */
export function resolvePlayerBinary(
  options: ResolvePlayerBinaryOptions,
): ResolvedPlayerBinary | null {
  const {
    packaged,
    resourcesPath,
    repoRoot,
    platform = process.platform,
    arch = process.arch,
    env = process.env,
    exists = fs.existsSync,
  } = options;

  const override = env.CUEPOINT_MPV_PATH?.trim();
  if (override) {
    // Trusted even if it does not exist: a user who set this and mistyped it
    // deserves an error naming their path, not a silent fallback to a bundled
    // binary they were deliberately overriding.
    return { path: override, source: "env" };
  }

  const relative = playerBinaryRelativePath(platform);

  if (packaged && resourcesPath) {
    const bundled = path.join(resourcesPath, "player", relative);
    if (exists(bundled)) return { path: bundled, source: "bundled" };
    return null;
  }

  const platformDir = playerPlatformDir(platform, arch);
  if (!repoRoot || !platformDir) return null;
  const development = path.join(
    repoRoot,
    "apps",
    "desktop-electron",
    "resources",
    "player",
    platformDir,
    relative,
  );
  if (exists(development)) return { path: development, source: "development" };
  return null;
}

/**
 * The environment variable the engine reads its decoder from (WAVE-01, DEC-123).
 *
 * The engine has no decoder of its own. Waveform analysis runs the player's
 * mpv, and only this process knows where that is, so it names it to the engine
 * when it spawns it. Kept in step with `DECODER_PATH_ENV` in
 * `src/cuepoint/data/audio_decode.py`; a test reads both.
 */
export const DECODER_PATH_ENV = "CUEPOINT_DECODER_PATH";

/**
 * The environment an engine is spawned with, naming the decoder or not.
 *
 * With no decoder the variable is removed rather than left as inherited: the
 * engine must analyse with the binary this process resolved, or with nothing,
 * never with one a parent environment happened to carry.
 */
export function withDecoderPath(
  env: NodeJS.ProcessEnv,
  decoderPath: string | null,
): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  if (decoderPath && decoderPath.trim()) {
    next[DECODER_PATH_ENV] = decoderPath;
  } else {
    delete next[DECODER_PATH_ENV];
  }
  return next;
}

/** Why no player is available, phrased for a human. */
export function playerUnavailableReason(
  options: ResolvePlayerBinaryOptions,
): string {
  const platformDir = playerPlatformDir(options.platform ?? process.platform, options.arch ?? process.arch);
  if (!platformDir) {
    return "Audio playback is not supported on this platform.";
  }
  if (options.packaged) {
    return "This build does not include the audio player. Set CUEPOINT_MPV_PATH to an mpv binary to enable playback.";
  }
  return (
    "No audio player found. Run `python scripts/fetch_player_sidecar.py` to download mpv, " +
    "or set CUEPOINT_MPV_PATH to an existing one."
  );
}
