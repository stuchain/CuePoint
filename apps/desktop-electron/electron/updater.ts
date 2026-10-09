/**
 * The updater (DIST-06, DEC-145, DEC-153, DEC-169, DEC-170, DEC-173, DEC-174).
 *
 * A small state machine, and the one place either installer is driven. It asks
 * `fetchReleases` for the published releases, lets `pickUpdate` choose (the rule
 * is DIST-05's, and nothing else decides), then:
 *
 * - Windows: `electron-updater` is pointed at the chosen release's own download
 *   folder with a generic feed and does the rest: the manifest, the SHA-512
 *   check, the install. Its own idea of "latest" is never used (DEC-169).
 * - macOS: `macInstaller.ts` downloads, checks and unpacks the chip's zip, and a
 *   script replaces the app after it quits (DEC-170).
 * - Linux: nothing downloads; the page links to the release (DEC-174).
 *
 * The phase text lists `available` as a state. It is folded into the states that
 * show it: `downloading` where an update downloads (Windows, Mac), `manual`
 * where the person has to fetch it (Linux, and a Mac whose app cannot be replaced).
 *
 * `idle` -> `checking` -> `up-to-date` | `downloading` -> `ready` | `manual` | `failed`.
 * A `ready` or `manual` update stays on screen while later checks run, so the
 * button never flickers away; a later check that finds the same version keeps
 * `ready`, and one that finds a higher version downloads that one.
 *
 * When it runs: 10 s after the first window shows, every 4 hours, and when the
 * person asks. Never from source, never in an end-to-end run, and never on a
 * computer CuePoint has no build for.
 *
 * What is reported (DEC-153): a failed download, a download that fails its
 * checksum, size, version or chip check, and a failed install. What is not:
 * offline, a DNS failure, GitHub's rate limit (403, 429) or a timeout. Those
 * read "could not check" or a plain failed download and are tried again at the
 * next check.
 *
 * Every side effect is passed in, so none of this needs Electron to test.
 */
import { compareVersions, isTestVersion, parseVersion, pickUpdate, type Release, type UpdateTarget } from "./updateRule";
import type { BundleLocation, PreparedMacUpdate, PrepareMacUpdateOptions } from "./macInstaller";
import { MacUpdateError } from "./macInstaller";
import { RELEASES_REPOSITORY, mapRelease, type FetchReleasesOptions, type ReleaseListResult } from "./releaseList";
import { writeNotes } from "./updateNotes";

/** How long after the window shows the first check runs (the first paint and the engine come first). */
export const LAUNCH_CHECK_DELAY_MS = 10_000;
/** How often an open app checks again. */
export const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/** The environment variable DIST-08's test points a packaged test build at a staged release with. */
export const UPDATE_FEED_ENV = "CUEPOINT_UPDATE_FEED";

export type UpdateStatus = "idle" | "checking" | "up-to-date" | "downloading" | "ready" | "manual" | "failed";
export type ManualReason = "linux" | "cannot-replace";
export type UpdateError = "could-not-check" | "download-failed" | "install-failed";

/** What the page is sent (`updates:state`) and asked for (`updates:getState`). */
export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  /** The version found, once there is one. */
  version: string | null;
  notes: string | null;
  /** 0-100 while downloading, else null (100 once ready). */
  progress: number | null;
  /** The release's page on GitHub. */
  releaseUrl: string | null;
  manualReason: ManualReason | null;
  error: UpdateError | null;
  /** When a check last finished, as an ISO date. */
  lastCheckedAt: string | null;
}

/** The part of `electron-updater`'s `autoUpdater` this file uses. */
export interface WindowsUpdater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  forceDevUpdateConfig: boolean;
  setFeedURL: (options: { provider: "generic"; url: string; channel: string }) => void;
  checkForUpdates: () => Promise<{ updateInfo: { version: string } } | null>;
  downloadUpdate: () => Promise<unknown>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  on: (event: string, listener: (arg: never) => void) => unknown;
}

export interface UpdaterDeps {
  packaged: boolean;
  /** True in an end-to-end run, which never updates. */
  e2e: boolean;
  platform: NodeJS.Platform;
  arch: string;
  /**
   * `app.runningUnderARM64Translation`: an Intel build running on Apple Silicon under Rosetta.
   * Such a copy is offered the arm64 build, which replaces it with a native one.
   */
  translated?: boolean;
  appVersion: string;
  env: Record<string, string | undefined>;
  /** `userData/updates`. */
  updatesDir: string;
  fetchReleases: (options: FetchReleasesOptions) => Promise<ReleaseListResult>;
  /** Reads a test feed on this computer, which `fetchReleases` (HTTPS only) cannot. */
  fetchImpl: typeof fetch;
  /** `electron-updater`'s `autoUpdater`, loaded when first needed. */
  windowsUpdater: () => WindowsUpdater;
  locateMacBundle: () => BundleLocation;
  /** `fs.existsSync`; whether a downloaded app is still on disk. */
  pathExists: (target: string) => boolean;
  /** The tail of the Mac install script's log, scrubbed, or null. Attached to a failed install's report. */
  readInstallLog?: () => string | null;
  prepareMac: (options: Pick<PrepareMacUpdateOptions, "version" | "target" | "downloadBase" | "onProgress" | "allowLocalHttp">) => Promise<PreparedMacUpdate>;
  /** Starts the detached install script. */
  installMac: (options: { pid: number; oldApp: string; newApp: string; relaunch: boolean }) => void;
  settings: {
    read: () => { lastCheckedAt: string | null; pendingInstall: string | null };
    update: (patch: { lastCheckedAt?: string; pendingInstall?: string | null }) => unknown;
  };
  /** Reports an error once for the key (`reporting.ts`'s `reportOnce`). */
  report: (key: string, error: unknown, tags: Record<string, string>) => void;
  /** `app.quit()`; held by `quitAfter`, so the player and the engine stop first. */
  quit: () => void;
}

/** The build a computer gets, or null when CuePoint has none for it. */
export function targetForPlatform(platform: NodeJS.Platform, arch: string): UpdateTarget | null {
  if (platform === "win32") return arch === "x64" ? "win-x64" : null;
  if (platform === "darwin") return arch === "arm64" ? "mac-arm64" : arch === "x64" ? "mac-x64" : null;
  if (platform === "linux") return arch === "x64" ? "linux-x64" : null;
  return null;
}

/** An error that is the person's connection or GitHub's limit, not CuePoint's (DEC-153). */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof MacUpdateError) return error.kind === "network";
  if (typeof error !== "object" || error === null) return false;
  const { code, statusCode, message } = error as { code?: unknown; statusCode?: unknown; message?: unknown };
  if (statusCode === 403 || statusCode === 408 || statusCode === 429) return true;
  if (typeof code === "string" && /^(ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|EPIPE|ERR_INTERNET_DISCONNECTED)$/.test(code)) {
    return true;
  }
  return (
    typeof message === "string" &&
    /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|NETWORK_CHANGED|CONNECTION_(RESET|REFUSED|CLOSED|TIMED_OUT)|TIMED_OUT|PROXY)|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|socket hang up|timed out/i.test(message)
  );
}

interface TestFeed {
  /** No trailing slash. */
  base: string;
  /** http on this computer, which only the updater's own reader may fetch. */
  local: boolean;
}

/**
 * `CUEPOINT_UPDATE_FEED`, honoured only by a test version (`-test.N`): an https
 * address, or http on 127.0.0.1 or localhost. A folder can be served with
 * `python -m http.server`; `file://` is not supported. Anything else is ignored.
 */
function testFeed(env: Record<string, string | undefined>, appVersion: string): TestFeed | null {
  const raw = env[UPDATE_FEED_ENV]?.trim();
  if (!raw || !isTestVersion(appVersion)) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null;
  const base = parsed.href.replace(/\/+$/, "");
  if (parsed.protocol === "https:") return { base, local: false };
  if (parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    return { base, local: true };
  }
  return null;
}

/** A failed update step the person is told about as one of the three errors. */
class StepFailed extends Error {
  constructor(
    readonly error: "download-failed" | "install-failed",
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export class Updater {
  private state: UpdateState;
  private readonly listeners = new Set<(state: UpdateState) => void>();
  private readonly target: UpdateTarget | null;
  private readonly feed: TestFeed | null;
  private inflight: Promise<void> | null = null;
  /** Resolves when the running check has decided (downloading, up to date...), before any download ends. */
  private phase: Promise<void> | null = null;
  private phaseDone: (() => void) | null = null;
  private launchTimer: ReturnType<typeof setTimeout> | null = null;
  private repeatTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private windowsReady: WindowsUpdater | null = null;
  /** The version downloaded and waiting, what the page shows for it, and (Mac) where it was unpacked. */
  private ready: { version: string; notes: string; releaseUrl: string | null; newApp?: string } | null = null;
  private relaunch = false;
  private installStarted = false;
  /** Set when the quit goes ahead (`will-quit`): an install not started by then waits for the next quit. */
  private installsClosed = false;
  /** The version `electron-updater` last announced with `update-available`. */
  private announced: string | null = null;
  /** The state last sent, so a change that alters nothing sends nothing. */
  private sent: string;

  constructor(private readonly deps: UpdaterDeps) {
    this.target = targetForPlatform(deps.platform, deps.platform === "darwin" && deps.translated ? "arm64" : deps.arch);
    this.feed = testFeed(deps.env, deps.appVersion);
    let lastCheckedAt: string | null = null;
    try {
      lastCheckedAt = deps.settings.read().lastCheckedAt;
    } catch {
      lastCheckedAt = null;
    }
    this.state = {
      status: "idle",
      currentVersion: deps.appVersion,
      version: null,
      notes: null,
      progress: null,
      releaseUrl: null,
      manualReason: null,
      error: null,
      lastCheckedAt,
    };
    this.sent = JSON.stringify(this.state);
  }

  /** Whether this run may update at all. */
  get enabled(): boolean {
    return this.deps.packaged && !this.deps.e2e && this.target !== null;
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  subscribe(listener: (state: UpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Called when the first window shows: the launch check, then the repeat. Once. */
  start(): void {
    if (this.started || !this.enabled) return;
    this.started = true;
    this.launchTimer = setTimeout(() => {
      this.launchTimer = null;
      void this.check();
    }, LAUNCH_CHECK_DELAY_MS);
    this.repeatTimer = setInterval(() => {
      void this.check();
    }, RECHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.launchTimer) clearTimeout(this.launchTimer);
    if (this.repeatTimer) clearInterval(this.repeatTimer);
    this.launchTimer = null;
    this.repeatTimer = null;
  }

  /**
   * Checks now. A check that is already running is joined, not repeated. It
   * answers when the check has decided (an update found and downloading, up to
   * date, could not check), not when a download ends: follow that with
   * `subscribe`, or wait for it with `settled`.
   */
  check(): Promise<UpdateState> {
    if (!this.enabled) return Promise.resolve(this.getState());
    if (this.inflight === null) {
      this.phase = new Promise<void>((resolve) => {
        this.phaseDone = resolve;
      });
      this.inflight = this.run().finally(() => {
        this.phaseDone?.();
        this.inflight = null;
        this.phase = null;
        this.phaseDone = null;
        this.set({}); // sends the time of a check that changed nothing else
      });
    }
    return (this.phase ?? Promise.resolve()).then(() => this.getState());
  }

  /** Resolves when no check or download is running. */
  settled(): Promise<void> {
    return this.inflight ?? Promise.resolve();
  }

  /**
   * At launch: an install handed off last time that did not take (the running version
   * is still below it) is reported once as a failed install, with the Mac script's log.
   * The note is cleared either way, so it is never reported twice.
   */
  reportPendingInstall(): void {
    let pending: string | null;
    try {
      pending = this.deps.settings.read().pendingInstall;
      if (pending === null) return;
      this.deps.settings.update({ pendingInstall: null });
    } catch {
      return;
    }
    if (!parseVersion(this.deps.appVersion) || compareVersions(this.deps.appVersion, pending) >= 0) return;
    let log: string | null = null;
    try {
      log = this.deps.readInstallLog?.() ?? null;
    } catch {
      log = null;
    }
    const error = new Error(
      `The update to ${pending} did not install; CuePoint is still ${this.deps.appVersion}.${log ? `\n${log}` : ""}`,
    );
    this.set({ status: "failed", error: "install-failed", version: pending, progress: null });
    this.report("install", error, pending, true);
  }

  /**
   * The quit is going ahead (`will-quit`). `quitAfter` lets it through after 5 s whatever
   * the cleanup is doing; an install not started by then must not start while the process
   * is going away, so it waits for the next quit. A ready update stays ready.
   */
  closeInstalls(): void {
    this.installsClosed = true;
  }

  /**
   * Restart now (`updates:restart`): only when an update is ready. It marks the
   * relaunch and quits, through `quitAfter`, which stops the player and then the
   * engine first (fact 8); the install itself is `installAtQuit`, the last step
   * of that cleanup. Asking first while work runs is the page's job (DEC-173).
   *
   * Windows does not call `quitAndInstall` here, though the phase text reads as
   * if it should: `electron-updater` starts the installer before it asks the app
   * to quit (BaseUpdater.quitAndInstall), so the installer would run while the
   * engine and mpv still held their files.
   */
  restart(): boolean {
    if (this.state.status !== "ready" || this.ready === null) return false;
    // Already quitting for this: a second ask (two screens, a double click) does not quit twice.
    if (this.relaunch) return false;
    try {
      this.relaunch = true;
      this.deps.quit();
      return true;
    } catch (error) {
      this.relaunch = false;
      this.fail("install-failed", error, "install");
      return false;
    }
  }

  /**
   * The last step of `quitAfter`'s cleanup, once the player and the engine have
   * stopped: start the install of a ready update, so only a finished cleanup
   * ever starts an installer. Answers whether one started.
   *
   * - macOS: the install script, which waits for this process to exit and
   *   relaunches only if Restart now asked.
   * - Windows: `quitAndInstall` in silent mode, running the app afterwards only
   *   after Restart now. `autoInstallOnAppQuit` is off, because its own quit
   *   handler would start the installer without waiting for the cleanup.
   * - Linux: never; nothing downloaded.
   *
   * After `closeInstalls` (the 5 s limit let the quit through) nothing starts.
   * The note `pendingInstall` is written first, so an install that did not
   * take is noticed at the next launch (`reportPendingInstall`).
   */
  installAtQuit(pid: number): boolean {
    if (this.installsClosed || this.installStarted || this.state.status !== "ready" || this.ready === null) {
      return false;
    }
    const ready = this.ready;
    if (this.target === "win-x64") {
      this.installStarted = true;
      this.notePending(ready.version);
      try {
        this.windows().quitAndInstall(true, this.relaunch);
        return true;
      } catch (error) {
        this.notePending(null);
        this.report("install", error, ready.version);
        return false;
      }
    }
    const mac = this.target === "mac-arm64" || this.target === "mac-x64";
    if (!mac || !ready.newApp) return false;
    const location = this.deps.locateMacBundle();
    if (!location.ok) return false;
    this.installStarted = true;
    this.notePending(ready.version);
    try {
      this.deps.installMac({ pid, oldApp: location.bundle, newApp: ready.newApp, relaunch: this.relaunch });
      return true;
    } catch (error) {
      this.notePending(null);
      this.report("install", error, ready.version);
      return false;
    }
  }

  private notePending(version: string | null): void {
    try {
      this.deps.settings.update({ pendingInstall: version });
    } catch {
      // Without the note a failed install goes unreported; the install itself goes ahead.
    }
  }

  // --- one check ---------------------------------------------------------------

  private async run(): Promise<void> {
    const target = this.target!;
    // A ready or manual update stays on screen while the next check runs.
    if (this.state.status !== "ready" && this.state.status !== "manual") {
      this.set({ status: "checking", error: null, progress: null });
    }

    const listed = await this.list();
    if (!listed.ok) {
      this.couldNotCheck();
      return;
    }
    this.recordCheck();

    const chosen = pickUpdate(this.deps.appVersion, listed.releases, target);
    const version = chosen?.version ?? null;
    if (chosen === null || version === null) {
      if (this.ready) this.restoreReady();
      else if (this.state.status !== "manual") this.set({ status: "up-to-date" });
      return;
    }
    // Already downloaded, or something higher is: keep it, as it was before the check.
    if (this.ready && compareVersions(version, this.ready.version) <= 0) {
      this.restoreReady();
      return;
    }

    if (target === "linux-x64") {
      this.set({ ...this.found(chosen, version), status: "manual", manualReason: "linux", progress: null });
      writeNotes(this.deps.updatesDir, version, chosen.notes);
      return;
    }

    try {
      if (target === "win-x64") await this.downloadWindows(chosen, version);
      else await this.downloadMac(chosen, version, target);
    } catch (error) {
      const step = error instanceof StepFailed ? error : new StepFailed("download-failed", String(error), error);
      const kept = this.ready;
      if (kept?.newApp && this.deps.pathExists(kept.newApp)) {
        // The newer download failed but the older one is still on disk and still installs.
        this.report("download", step.cause ?? step, version);
        this.restoreReady();
        return;
      }
      this.ready = null;
      this.set(this.found(chosen, version));
      this.fail(step.error, step.cause ?? step, "download");
    }
  }

  /** Back to showing the downloaded update, when something else (a failed step) replaced it. */
  private restoreReady(): void {
    if (!this.ready) return;
    this.set({
      status: "ready",
      version: this.ready.version,
      notes: this.ready.notes,
      releaseUrl: this.ready.releaseUrl,
      progress: 100,
      error: null,
      manualReason: null,
    });
  }

  /** The version found, with its notes and page, ahead of whatever happens to it. */
  private found(release: Release, version: string): Partial<UpdateState> {
    return { version, notes: release.notes, releaseUrl: release.htmlUrl, manualReason: null, error: null };
  }

  private async list(): Promise<ReleaseListResult> {
    try {
      if (this.feed?.local) return await this.readLocalFeed(this.feed);
      return await this.deps.fetchReleases({
        appVersion: this.deps.appVersion,
        ...(this.feed ? { url: `${this.feed.base}/releases.json` } : {}),
      });
    } catch (error) {
      return { ok: false, reason: "could-not-check", detail: error instanceof Error ? error.message : String(error) };
    }
  }

  /** A staged folder served from this computer: `releases.json` in GitHub's shape. */
  private async readLocalFeed(feed: TestFeed): Promise<ReleaseListResult> {
    const couldNot = (detail: string): ReleaseListResult => ({ ok: false, reason: "could-not-check", detail });
    try {
      const response = await this.deps.fetchImpl(`${feed.base}/releases.json`, {
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
      if (!response.ok) return couldNot(`The test feed answered ${response.status}.`);
      const body: unknown = await response.json();
      if (!Array.isArray(body)) return couldNot("The test feed is not a list of releases.");
      const releases = body.map(mapRelease).filter((release): release is Release => release !== null);
      return { ok: true, releases };
    } catch (error) {
      return couldNot(error instanceof Error ? error.message : String(error));
    }
  }

  private couldNotCheck(): void {
    // A ready or manual update is still true; the check is simply tried again.
    if (this.ready) {
      this.restoreReady();
      return;
    }
    if (this.state.status === "manual") return;
    this.set({ status: "failed", error: "could-not-check", progress: null });
  }

  private recordCheck(): void {
    const at = new Date().toISOString();
    this.state.lastCheckedAt = at; // sent with the state this check ends in
    try {
      this.deps.settings.update({ lastCheckedAt: at });
    } catch {
      // The time is only for the page to show.
    }
  }

  // --- the downloads -------------------------------------------------------------

  /** Where a release's files are: GitHub's download folder, or the test feed's. */
  private downloadBase(tag: string): string {
    return this.feed
      ? `${this.feed.base}/${tag}/`
      : `https://github.com/${RELEASES_REPOSITORY}/releases/download/${tag}/`;
  }

  private beginDownload(release: Release, version: string): void {
    this.set({ ...this.found(release, version), status: "downloading", progress: 0 });
    // The check has decided: an update is on its way. Whoever asked can stop waiting.
    this.phaseDone?.();
  }

  private markReady(release: Release, version: string, newApp?: string): void {
    this.ready = { version, notes: release.notes, releaseUrl: release.htmlUrl, ...(newApp ? { newApp } : {}) };
    this.set({ status: "ready", version, notes: release.notes, progress: 100, error: null, manualReason: null });
    writeNotes(this.deps.updatesDir, version, release.notes);
  }

  private async downloadWindows(release: Release, version: string): Promise<void> {
    const url = this.downloadBase(release.tag);
    if (!url.startsWith("https://") && !this.feed?.local) {
      throw new StepFailed("download-failed", "Updates are only fetched over HTTPS.");
    }
    // A new download replaces the one `electron-updater` holds, so the old one is no longer ready.
    this.ready = null;
    this.announced = null;
    this.beginDownload(release, version);
    const updater = this.windows();
    updater.setFeedURL({ provider: "generic", url, channel: "latest" });
    const result = await updater.checkForUpdates();
    if (!result || result.updateInfo.version !== version) {
      throw new StepFailed(
        "download-failed",
        `The release's manifest is for ${result?.updateInfo.version ?? "no version"}, not ${version}.`,
      );
    }
    // It must also have said "update available" for this very version, so what it
    // downloads is the update it checked and not something it kept from before.
    if (this.announced !== version) {
      throw new StepFailed("download-failed", `electron-updater did not announce ${version} as an update.`);
    }
    await updater.downloadUpdate();
    this.markReady(release, version);
  }

  private async downloadMac(release: Release, version: string, target: UpdateTarget): Promise<void> {
    const location = this.deps.locateMacBundle();
    if (!location.ok) {
      this.set({ ...this.found(release, version), status: "manual", manualReason: "cannot-replace", progress: null });
      writeNotes(this.deps.updatesDir, version, release.notes);
      return;
    }
    this.beginDownload(release, version);
    try {
      const prepared = await this.deps.prepareMac({
        version,
        target,
        downloadBase: this.downloadBase(release.tag),
        allowLocalHttp: this.feed?.local === true,
        onProgress: (percent) => this.set({ status: "downloading", progress: percent }),
      });
      this.markReady(release, version, prepared.newApp);
    } catch (error) {
      throw new StepFailed("download-failed", error instanceof Error ? error.message : String(error), error);
    }
  }

  /** `electron-updater`'s `autoUpdater`, set up once. */
  private windows(): WindowsUpdater {
    if (this.windowsReady) return this.windowsReady;
    const updater = this.deps.windowsUpdater();
    // Its own choice is turned off: it is never asked to find a release (DEC-169), never
    // downloads by itself, and never installs by itself: its quit handler would start the
    // installer without waiting for `quitAfter`'s cleanup, so `installAtQuit` does it last.
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = true;
    updater.forceDevUpdateConfig = false;
    updater.on("download-progress", ((progress: { percent: number }) => {
      if (this.state.status === "downloading") this.set({ progress: Math.round(progress.percent) });
    }) as (arg: never) => void);
    updater.on("update-available", ((info: { version?: string }) => {
      this.announced = info?.version ?? null;
    }) as (arg: never) => void);
    // A failure is the rejected promise's; without a listener an `error` event would throw.
    updater.on("error", (() => undefined) as (arg: never) => void);
    this.windowsReady = updater;
    return updater;
  }

  // --- state ----------------------------------------------------------------------

  private fail(error: "download-failed" | "install-failed", cause: unknown, phase: "download" | "install"): void {
    this.set({ status: "failed", error, progress: null });
    this.report(phase, cause, this.state.version);
  }

  private report(phase: "download" | "install", cause: unknown, version: string | null, always = false): void {
    if (!always && isNetworkError(cause)) return;
    const key = `updater.${phase}.${version ?? "unknown"}`;
    try {
      this.deps.report(key, cause, {
        "updater.phase": phase,
        "updater.target": this.target ?? "none",
        ...(version ? { "updater.version": version } : {}),
      });
    } catch {
      // Reporting never changes what the person sees.
    }
  }

  private set(patch: Partial<UpdateState>): void {
    const next = { ...this.state, ...patch };
    this.state = next;
    const text = JSON.stringify(next);
    if (text === this.sent) return;
    this.sent = text;
    for (const listener of this.listeners) {
      try {
        listener({ ...next });
      } catch {
        // A listener that throws must not stop the others.
      }
    }
  }
}
