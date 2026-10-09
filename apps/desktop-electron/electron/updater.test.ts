import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MacUpdateError } from "./macInstaller";
import type { ReleaseListResult } from "./releaseList";
import {
  LAUNCH_CHECK_DELAY_MS,
  RECHECK_INTERVAL_MS,
  Updater,
  targetForPlatform,
  type UpdateState,
  type UpdaterDeps,
  type WindowsUpdater,
} from "./updater";
import { targetFileName, MANIFEST_FOR_TARGET, type Release, type UpdateTarget } from "./updateRule";

/**
 * The updater's state machine (DIST-06, DEC-145, DEC-153, DEC-169, DEC-170, DEC-174).
 *
 * Everything outside it is faked: the release list, `electron-updater`, the Mac
 * installer, the settings file, the reporter and the clock.
 */

const made: string[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T10:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function release(version: string, target: UpdateTarget, extra: Partial<Release> = {}): Release {
  return {
    tag: `v${version}`,
    version,
    draft: false,
    prerelease: version.includes("-test"),
    notes: `Notes for ${version}`,
    publishedAt: "2026-10-01T00:00:00Z",
    htmlUrl: `https://github.com/stuchain/CuePoint/releases/tag/v${version}`,
    assets: [
      { name: MANIFEST_FOR_TARGET[target], url: "https://example.invalid/m" },
      { name: targetFileName(version, target), url: "https://example.invalid/f" },
    ],
    ...extra,
  };
}

class FakeWindowsUpdater implements WindowsUpdater {
  autoDownload = true;
  autoInstallOnAppQuit = false;
  allowDowngrade = true;
  allowPrerelease = false;
  forceDevUpdateConfig = true;
  feeds: Array<{ provider: string; url: string; channel: string }> = [];
  manifestVersion: string | null = null; // null: the chosen version
  downloadError: Error | null = null;
  announce = true; // say "update-available" for the manifest's version, as the real one does
  checks = 0;
  downloads = 0;
  quitAndInstall = vi.fn();
  private listeners = new Map<string, Array<(arg: never) => void>>();
  on(event: string, listener: (arg: never) => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  emit(event: string, arg: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(arg as never);
  }
  setFeedURL(options: { provider: "generic"; url: string; channel: string }): void {
    this.feeds.push(options);
  }
  async checkForUpdates() {
    this.checks += 1;
    const tag = /\/(v[^/]+)\/$/.exec(this.feeds.at(-1)?.url ?? "")?.[1] ?? "v0.0.0";
    const version = this.manifestVersion ?? tag.slice(1);
    if (this.announce) this.emit("update-available", { version });
    return { updateInfo: { version } };
  }
  async downloadUpdate() {
    this.downloads += 1;
    if (this.downloadError) throw this.downloadError;
    this.emit("download-progress", { percent: 40.4 });
    this.emit("download-progress", { percent: 90 });
    this.emit("update-downloaded", { version: "x" });
    return [];
  }
}

interface Setup {
  updater: Updater;
  deps: UpdaterDeps;
  win: FakeWindowsUpdater;
  states: UpdateState[];
  report: ReturnType<typeof vi.fn>;
  settings: { lastCheckedAt: string | null; lastSeenVersion: string | null; pendingInstall: string | null };
  existing: Set<string>;
  updatesDir: string;
  listResult: { current: ReleaseListResult | Promise<ReleaseListResult> };
  listCalls: Array<{ appVersion: string; url?: string }>;
  prepareMac: ReturnType<typeof vi.fn>;
  installMac: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
}

function setup(overrides: Partial<UpdaterDeps> & { target?: UpdateTarget; releases?: Release[] } = {}): Setup {
  const updatesDir = fs.mkdtempSync(path.join(os.tmpdir(), "cuepoint-updater-"));
  made.push(updatesDir);
  const win = new FakeWindowsUpdater();
  const report = vi.fn();
  const settings = {
    lastCheckedAt: null as string | null,
    lastSeenVersion: null as string | null,
    pendingInstall: null as string | null,
  };
  const existing = new Set<string>();
  const target = overrides.target ?? "win-x64";
  const platform = target === "win-x64" ? "win32" : target === "linux-x64" ? "linux" : "darwin";
  const arch = target === "mac-arm64" ? "arm64" : "x64";
  const releases = overrides.releases ?? [release("1.5.0", target)];
  const listResult: Setup["listResult"] = { current: { ok: true, releases } };
  const listCalls: Setup["listCalls"] = [];
  const prepareMac = vi.fn(async (options: { version?: string }) => {
    const newApp = path.join(updatesDir, options.version ?? "x", "unpacked", "CuePoint.app");
    existing.add(newApp);
    return { newApp };
  });
  const installMac = vi.fn();
  const quit = vi.fn();
  const states: UpdateState[] = [];
  const deps: UpdaterDeps = {
    packaged: true,
    e2e: false,
    platform,
    arch,
    appVersion: "1.4.0",
    env: {},
    updatesDir,
    fetchReleases: async (options) => {
      listCalls.push(options);
      return listResult.current;
    },
    fetchImpl: (async () => new Response("[]")) as typeof fetch,
    windowsUpdater: () => win,
    locateMacBundle: () => ({ ok: true, bundle: "/Applications/CuePoint.app" }),
    pathExists: (target) => existing.has(target),
    prepareMac,
    installMac,
    settings: {
      read: () => ({ ...settings }),
      update: (patch) => {
        Object.assign(settings, patch);
      },
    },
    report,
    quit,
    ...overrides,
  };
  const updater = new Updater(deps);
  updater.subscribe((state) => states.push(state));
  return { updater, deps, win, states, report, settings, existing, updatesDir, listResult, listCalls, prepareMac, installMac, quit };
}

/** Checks, then waits for any download the check started. */
async function settle(updater: Updater): Promise<void> {
  await updater.check();
  await updater.settled();
}

const statuses = (s: Setup): string[] => s.states.map((state) => state.status);

describe("the target", () => {
  it.each([
    ["win32", "x64", "win-x64"],
    ["darwin", "arm64", "mac-arm64"],
    ["darwin", "x64", "mac-x64"],
    ["linux", "x64", "linux-x64"],
  ] as const)("%s %s is %s", (platform, arch, expected) => {
    expect(targetForPlatform(platform, arch)).toBe(expected);
  });

  it.each([
    ["win32", "arm64"],
    ["win32", "ia32"],
    ["linux", "arm64"],
    ["darwin", "ia32"],
    ["freebsd", "x64"],
  ])("%s %s has none", (platform, arch) => {
    expect(targetForPlatform(platform as NodeJS.Platform, arch)).toBeNull();
  });
});

describe("when it runs", () => {
  it("starts idle with the running version", () => {
    const s = setup();
    expect(s.updater.getState()).toEqual({
      status: "idle",
      currentVersion: "1.4.0",
      version: null,
      notes: null,
      progress: null,
      releaseUrl: null,
      manualReason: null,
      error: null,
      lastCheckedAt: null,
    });
  });

  it("reads the last check from the settings", () => {
    const s = setup();
    s.settings.lastCheckedAt = "2026-10-01T00:00:00.000Z";
    expect(new Updater(s.deps).getState().lastCheckedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("checks 10 seconds after the window, and again every 4 hours", async () => {
    const s = setup();
    s.updater.start();
    expect(s.listCalls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(LAUNCH_CHECK_DELAY_MS - 1);
    expect(s.listCalls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.listCalls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS);
    expect(s.listCalls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS);
    expect(s.listCalls).toHaveLength(3);
    expect(LAUNCH_CHECK_DELAY_MS).toBe(10_000);
    expect(RECHECK_INTERVAL_MS).toBe(4 * 60 * 60 * 1000);
  });

  it("starts once, however many windows open", async () => {
    const s = setup();
    s.updater.start();
    s.updater.start();
    await vi.advanceTimersByTimeAsync(LAUNCH_CHECK_DELAY_MS);
    expect(s.listCalls).toHaveLength(1);
  });

  it("stops checking after stop()", async () => {
    const s = setup();
    s.updater.start();
    s.updater.stop();
    await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS * 2);
    expect(s.listCalls).toHaveLength(0);
  });

  it("never starts or checks when unpackaged", async () => {
    const s = setup({ packaged: false });
    s.updater.start();
    await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS);
    await settle(s.updater);
    expect(s.listCalls).toHaveLength(0);
    expect(s.updater.getState().status).toBe("idle");
  });

  it("never starts or checks in an end-to-end run", async () => {
    const s = setup({ e2e: true });
    s.updater.start();
    await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS);
    await settle(s.updater);
    expect(s.listCalls).toHaveLength(0);
    expect(s.updater.getState().status).toBe("idle");
  });

  it("never checks on a computer it has no build for", async () => {
    const s = setup({ platform: "win32", arch: "arm64" });
    s.updater.start();
    await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS);
    await settle(s.updater);
    expect(s.listCalls).toHaveLength(0);
    expect(s.updater.getState().status).toBe("idle");
  });

  it("sends the running version to the release list", async () => {
    const s = setup();
    await settle(s.updater);
    expect(s.listCalls[0]).toMatchObject({ appVersion: "1.4.0" });
  });
});

describe("a check", () => {
  it("joins a check that is already running", async () => {
    const s = setup();
    let release!: (value: ReleaseListResult) => void;
    s.listResult.current = new Promise<ReleaseListResult>((resolve) => {
      release = resolve;
    });
    const first = s.updater.check();
    const second = s.updater.check();
    expect(s.updater.getState().status).toBe("checking");
    release({ ok: true, releases: [] });
    await Promise.all([first, second]);
    expect(s.listCalls).toHaveLength(1);
  });

  it("answers when the check has decided, not when the download ends", async () => {
    const s = setup();
    let finish!: () => void;
    s.win.downloadUpdate = async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      s.win.emit("update-downloaded", { version: "x" });
      return [];
    };
    const state = await s.updater.check();
    expect(state).toMatchObject({ status: "downloading", version: "1.5.0" });
    // A second check joins the same run and also answers at once.
    expect(await s.updater.check()).toMatchObject({ status: "downloading" });
    expect(s.listCalls).toHaveLength(1);
    finish();
    await s.updater.settled();
    expect(s.updater.getState().status).toBe("ready");
  });

  it("can run again once the last one has finished", async () => {
    const s = setup();
    await settle(s.updater);
    await settle(s.updater);
    expect(s.listCalls).toHaveLength(2);
  });

  it("is up to date when nothing newer is published, and records the time", async () => {
    const s = setup({ releases: [] });
    await settle(s.updater);
    expect(statuses(s)).toEqual(["checking", "up-to-date"]);
    expect(s.updater.getState().lastCheckedAt).toBe("2026-10-08T10:00:00.000Z");
    expect(s.settings.lastCheckedAt).toBe("2026-10-08T10:00:00.000Z");
  });

  it("uses the rule, not the newest published: a hotfix below a test build is not offered", async () => {
    const s = setup({
      appVersion: "1.5.0-test.1",
      releases: [release("1.4.1", "win-x64")],
    });
    await settle(s.updater);
    expect(s.updater.getState().status).toBe("up-to-date");
    expect(s.win.checks).toBe(0);
  });

  it.each([
    ["offline", { ok: false, reason: "could-not-check", detail: "fetch failed" }],
    ["a 403", { ok: false, reason: "could-not-check", detail: "GitHub answered 403." }],
    ["a 429", { ok: false, reason: "could-not-check", detail: "GitHub answered 429." }],
    ["a timeout", { ok: false, reason: "could-not-check", detail: "Timed out after 15000 ms." }],
  ] as const)("says could not check on %s, and sends no report", async (_what, result) => {
    const s = setup();
    s.listResult.current = result;
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "could-not-check" });
    expect(s.report).not.toHaveBeenCalled();
    expect(s.settings.lastCheckedAt).toBeNull();
  });

  it("tries again at the next scheduled check after could-not-check", async () => {
    const s = setup();
    s.updater.start();
    s.listResult.current = { ok: false, reason: "could-not-check", detail: "offline" };
    await vi.advanceTimersByTimeAsync(LAUNCH_CHECK_DELAY_MS);
    expect(s.updater.getState().status).toBe("failed");
    s.listResult.current = { ok: true, releases: [] };
    await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS);
    expect(s.updater.getState()).toMatchObject({ status: "up-to-date", error: null });
  });

  it("says could not check when the list reader throws, and sends no report", async () => {
    const s = setup({
      fetchReleases: async () => {
        throw new Error("boom");
      },
    });
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "could-not-check" });
    expect(s.report).not.toHaveBeenCalled();
  });
});

describe("Windows (DEC-169)", () => {
  it("points a generic feed at the chosen release's folder and downloads it", async () => {
    const s = setup();
    await settle(s.updater);

    expect(s.win.feeds).toEqual([
      { provider: "generic", url: "https://github.com/stuchain/CuePoint/releases/download/v1.5.0/", channel: "latest" },
    ]);
    expect(s.win.autoDownload).toBe(false);
    expect(s.win.autoInstallOnAppQuit).toBe(false);
    expect(s.win.allowDowngrade).toBe(false);
    expect(s.win.allowPrerelease).toBe(true);
    expect(s.win.forceDevUpdateConfig).toBe(false);
    expect(s.win.downloads).toBe(1);
  });

  it("goes checking, downloading with a percentage, then ready", async () => {
    const s = setup();
    await settle(s.updater);
    expect(statuses(s)).toEqual(["checking", "downloading", "downloading", "downloading", "ready"]);
    expect(s.states.filter((state) => state.status === "downloading").map((state) => state.progress)).toEqual([
      0, 40, 90,
    ]);
    expect(s.updater.getState()).toMatchObject({
      status: "ready",
      version: "1.5.0",
      notes: "Notes for 1.5.0",
      progress: 100,
      releaseUrl: "https://github.com/stuchain/CuePoint/releases/tag/v1.5.0",
      error: null,
      manualReason: null,
    });
  });

  it("refuses a manifest whose version differs from the chosen one, and reports it", async () => {
    const s = setup();
    s.win.manifestVersion = "1.9.9";
    await settle(s.updater);
    expect(s.win.downloads).toBe(0);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "download-failed" });
    expect(s.report).toHaveBeenCalledTimes(1);
  });

  it("refuses a manifest the updater did not answer for", async () => {
    const s = setup();
    s.win.checkForUpdates = async () => null as never;
    await settle(s.updater);
    expect(s.win.downloads).toBe(0);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "download-failed" });
  });

  it("sends exactly one report for a failed download, and none again at the next check", async () => {
    const s = setup();
    s.win.downloadError = new Error("sha512 checksum mismatch");
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "download-failed", version: "1.5.0" });
    expect(s.report).toHaveBeenCalledTimes(1);
    await settle(s.updater);
    expect(s.report.mock.calls.length).toBeGreaterThanOrEqual(1);
    const keys = new Set(s.report.mock.calls.map((call) => call[0]));
    expect(keys.size).toBe(1); // the reporter dedupes on the key
  });

  it.each([
    ["no connection", Object.assign(new Error("getaddrinfo ENOTFOUND github.com"), { code: "ENOTFOUND" })],
    ["a dropped connection", new Error("net::ERR_INTERNET_DISCONNECTED")],
    ["a reset", Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })],
    ["a timeout", Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })],
    ["a 403", Object.assign(new Error("HttpError: 403"), { statusCode: 403 })],
    ["a 429", Object.assign(new Error("HttpError: 429"), { statusCode: 429 })],
  ])("does not report a download that failed from %s", async (_what, error) => {
    const s = setup();
    s.win.downloadError = error;
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "download-failed" });
    expect(s.report).not.toHaveBeenCalled();
  });

  it("does not download a version it already has, and keeps ready", async () => {
    const s = setup();
    await settle(s.updater);
    await settle(s.updater);
    expect(s.win.downloads).toBe(1);
    expect(s.updater.getState().status).toBe("ready");
    // It never left ready for checking, so the button stays.
    expect(statuses(s).slice(5).every((status) => status === "ready")).toBe(true);
  });

  it("keeps ready when a later check cannot reach GitHub", async () => {
    const s = setup();
    await settle(s.updater);
    s.listResult.current = { ok: false, reason: "could-not-check", detail: "offline" };
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "ready", version: "1.5.0" });
  });

  it("downloads a higher version found while ready", async () => {
    const s = setup({ releases: [release("1.5.0", "win-x64")] });
    await settle(s.updater);
    s.listResult.current = { ok: true, releases: [release("1.5.0", "win-x64"), release("1.5.1", "win-x64")] };
    await settle(s.updater);
    expect(s.win.downloads).toBe(2);
    expect(s.win.feeds.at(-1)!.url).toContain("/v1.5.1/");
    expect(s.updater.getState()).toMatchObject({ status: "ready", version: "1.5.1" });
  });

  it("restart quits through quitAfter, and the silent install with a relaunch is the last step of its cleanup", async () => {
    const s = setup();
    await settle(s.updater);
    expect(s.updater.restart()).toBe(true);
    // electron-updater starts the installer before it quits, so it is not called yet:
    // the player and the engine must stop first (fact 8).
    expect(s.win.quitAndInstall).not.toHaveBeenCalled();
    expect(s.quit).toHaveBeenCalledTimes(1);

    expect(s.updater.installAtQuit(4242)).toBe(true);
    expect(s.win.quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(s.updater.installAtQuit(4242)).toBe(false);
    expect(s.win.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("installs a ready update at a plain quit too, silently and without a relaunch, only from the cleanup", async () => {
    const s = setup();
    await settle(s.updater);
    // Nothing installs by itself: the updater's own quit handler would not wait for the cleanup.
    expect(s.win.autoInstallOnAppQuit).toBe(false);
    expect(s.win.quitAndInstall).not.toHaveBeenCalled();
    expect(s.updater.installAtQuit(7)).toBe(true);
    expect(s.win.quitAndInstall).toHaveBeenCalledWith(true, false);
  });

  it("starts no install once the quit has gone ahead without the cleanup (the 5 s limit)", async () => {
    const s = setup();
    await settle(s.updater);
    s.updater.closeInstalls(); // will-quit: quitAfter let the quit through
    expect(s.updater.installAtQuit(7)).toBe(false);
    expect(s.win.quitAndInstall).not.toHaveBeenCalled();
    expect(s.settings.pendingInstall).toBeNull();
    // The update is still ready; it installs at the next quit.
    expect(s.updater.getState().status).toBe("ready");
  });

  it("notes the version before handing off to the installer", async () => {
    const s = setup();
    await settle(s.updater);
    s.win.quitAndInstall.mockImplementation(() => {
      expect(s.settings.pendingInstall).toBe("1.5.0");
    });
    s.updater.installAtQuit(7);
    expect(s.settings.pendingInstall).toBe("1.5.0");
  });

  it("restart does nothing unless ready", () => {
    const s = setup();
    expect(s.updater.restart()).toBe(false);
    expect(s.quit).not.toHaveBeenCalled();
  });

  it("reports an installer that cannot start, once, and forgets the note", async () => {
    const s = setup();
    await settle(s.updater);
    s.win.quitAndInstall.mockImplementation(() => {
      throw new Error("cannot install");
    });
    expect(s.updater.installAtQuit(7)).toBe(false);
    expect(s.report).toHaveBeenCalledTimes(1);
    expect(s.settings.pendingInstall).toBeNull();
  });

  it("reports a restart whose quit throws as an install failure", async () => {
    const s = setup({
      quit: () => {
        throw new Error("cannot quit");
      },
    });
    await settle(s.updater);
    expect(s.updater.restart()).toBe(false);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "install-failed" });
    expect(s.report).toHaveBeenCalledTimes(1);
  });

  it("refuses a download when electron-updater never announced the version", async () => {
    const s = setup();
    s.win.announce = false;
    await settle(s.updater);
    expect(s.win.downloads).toBe(0);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "download-failed" });
    expect(s.report).toHaveBeenCalledTimes(1);
  });

  it("is not ready any more once a newer download starts and fails", async () => {
    const s = setup();
    await settle(s.updater);
    s.listResult.current = { ok: true, releases: [release("1.5.0", "win-x64"), release("1.5.1", "win-x64")] };
    s.win.downloadError = new Error("sha512 checksum mismatch");
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "download-failed", version: "1.5.1" });
    expect(s.updater.restart()).toBe(false);
    expect(s.updater.installAtQuit(7)).toBe(false);
  });

  it("writes the notes beside the download when it is ready", async () => {
    const s = setup();
    await settle(s.updater);
    expect(fs.readFileSync(path.join(s.updatesDir, "1.5.0", "notes.md"), "utf8")).toBe("Notes for 1.5.0");
  });
});

describe("macOS (DEC-170)", () => {
  it("downloads through the Mac installer into the updates folder and is ready", async () => {
    const s = setup({ target: "mac-arm64" });
    s.prepareMac.mockImplementation(async (options: { onProgress?: (n: number) => void }) => {
      options.onProgress?.(50);
      return { newApp: "/updates/1.5.0/unpacked/CuePoint.app" };
    });
    await settle(s.updater);

    expect(s.prepareMac).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "1.5.0",
        target: "mac-arm64",
        downloadBase: "https://github.com/stuchain/CuePoint/releases/download/v1.5.0/",
      }),
    );
    expect(statuses(s)).toEqual(["checking", "downloading", "downloading", "ready"]);
    expect(s.updater.getState()).toMatchObject({ status: "ready", version: "1.5.0", progress: 100 });
    expect(s.win.checks).toBe(0);
    expect(s.installMac).not.toHaveBeenCalled();
  });

  it("picks the Intel build on an Intel Mac", async () => {
    const s = setup({ target: "mac-x64" });
    await settle(s.updater);
    expect(s.prepareMac).toHaveBeenCalledWith(expect.objectContaining({ target: "mac-x64" }));
  });

  it("is manual, and downloads nothing, when the app cannot be replaced", async () => {
    const s = setup({
      target: "mac-arm64",
      locateMacBundle: () => ({ ok: false, reason: "cannot-replace", detail: "disk image" }),
    });
    await settle(s.updater);
    expect(s.prepareMac).not.toHaveBeenCalled();
    expect(s.updater.getState()).toMatchObject({
      status: "manual",
      manualReason: "cannot-replace",
      version: "1.5.0",
      notes: "Notes for 1.5.0",
      releaseUrl: "https://github.com/stuchain/CuePoint/releases/tag/v1.5.0",
    });
    expect(fs.readFileSync(path.join(s.updatesDir, "1.5.0", "notes.md"), "utf8")).toBe("Notes for 1.5.0");
  });

  it("fails and reports once when the download does not check out", async () => {
    const s = setup({ target: "mac-arm64" });
    s.prepareMac.mockRejectedValue(new MacUpdateError("checksum", "The download does not match."));
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "download-failed" });
    expect(s.report).toHaveBeenCalledTimes(1);
  });

  it("does not report a download that failed from the network", async () => {
    const s = setup({ target: "mac-arm64" });
    s.prepareMac.mockRejectedValue(new MacUpdateError("network", "fetch failed"));
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "download-failed" });
    expect(s.report).not.toHaveBeenCalled();
  });

  it("restart marks the relaunch and quits", async () => {
    const s = setup({ target: "mac-arm64" });
    await settle(s.updater);
    expect(s.updater.restart()).toBe(true);
    expect(s.quit).toHaveBeenCalledTimes(1);

    expect(s.updater.installAtQuit(4242)).toBe(true);
    expect(s.installMac).toHaveBeenCalledWith({
      pid: 4242,
      oldApp: "/Applications/CuePoint.app",
      newApp: expect.stringContaining("CuePoint.app"),
      relaunch: true,
    });
  });

  it("installs at a plain quit without relaunching", async () => {
    const s = setup({ target: "mac-arm64" });
    await settle(s.updater);
    expect(s.updater.installAtQuit(7)).toBe(true);
    expect(s.installMac).toHaveBeenCalledWith(expect.objectContaining({ relaunch: false }));
  });

  it("installs only once", async () => {
    const s = setup({ target: "mac-arm64" });
    await settle(s.updater);
    s.updater.installAtQuit(7);
    expect(s.updater.installAtQuit(7)).toBe(false);
    expect(s.installMac).toHaveBeenCalledTimes(1);
  });

  it("starts no install when nothing is ready", () => {
    const s = setup({ target: "mac-arm64" });
    expect(s.updater.installAtQuit(7)).toBe(false);
    expect(s.installMac).not.toHaveBeenCalled();
  });

  it("reports an install that could not start", async () => {
    const s = setup({ target: "mac-arm64" });
    await settle(s.updater);
    s.installMac.mockImplementation(() => {
      throw new Error("spawn failed");
    });
    expect(s.updater.installAtQuit(7)).toBe(false);
    expect(s.report).toHaveBeenCalledTimes(1);
  });
});

describe("a ready update that something else replaced", () => {
  it("Mac: a failed newer download goes back to the older ready bundle that is still on disk", async () => {
    const s = setup({ target: "mac-arm64", releases: [release("1.5.0", "mac-arm64")] });
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "ready", version: "1.5.0" });

    s.listResult.current = { ok: true, releases: [release("1.5.0", "mac-arm64"), release("1.5.1", "mac-arm64")] };
    s.prepareMac.mockRejectedValueOnce(new MacUpdateError("checksum", "does not match"));
    await settle(s.updater);

    expect(s.updater.getState()).toMatchObject({ status: "ready", version: "1.5.0", notes: "Notes for 1.5.0", error: null });
    expect(s.report).toHaveBeenCalledTimes(1);
    expect(s.updater.installAtQuit(7)).toBe(true);
    expect(s.installMac).toHaveBeenCalledWith(expect.objectContaining({ newApp: expect.stringContaining("1.5.0") }));
  });

  it("Mac: with the older bundle gone, a failed newer download is just failed", async () => {
    const s = setup({ target: "mac-arm64", releases: [release("1.5.0", "mac-arm64")] });
    await settle(s.updater);
    s.existing.clear();
    s.listResult.current = { ok: true, releases: [release("1.5.1", "mac-arm64")] };
    s.prepareMac.mockRejectedValueOnce(new MacUpdateError("checksum", "does not match"));
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "download-failed" });
    expect(s.updater.restart()).toBe(false);
  });

  it("a later check that picks the ready version again restores ready after an install failure", async () => {
    const s = setup({
      target: "mac-arm64",
      quit: () => {
        throw new Error("cannot quit");
      },
    });
    await settle(s.updater);
    expect(s.updater.restart()).toBe(false);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "install-failed" });

    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "ready", version: "1.5.0", error: null });
  });

  it("a check that cannot reach GitHub also restores ready", async () => {
    const s = setup({
      target: "mac-arm64",
      quit: () => {
        throw new Error("cannot quit");
      },
    });
    await settle(s.updater);
    s.updater.restart();
    s.listResult.current = { ok: false, reason: "could-not-check", detail: "offline" };
    await settle(s.updater);
    expect(s.updater.getState().status).toBe("ready");
  });
});

describe("Rosetta", () => {
  it("an Intel build translated on Apple Silicon is offered the arm64 build", async () => {
    const s = setup({ target: "mac-arm64", arch: "x64", translated: true });
    await settle(s.updater);
    expect(s.prepareMac).toHaveBeenCalledWith(expect.objectContaining({ target: "mac-arm64" }));
  });

  it("a plain Intel Mac keeps the Intel build", async () => {
    const s = setup({ target: "mac-x64", arch: "x64", translated: false });
    await settle(s.updater);
    expect(s.prepareMac).toHaveBeenCalledWith(expect.objectContaining({ target: "mac-x64" }));
  });
});

describe("an install that did not take (DIST-06)", () => {
  it("is reported once at the next launch, with the script's log, and the note is cleared", () => {
    const s = setup({ target: "mac-arm64", readInstallLog: () => "2026-10-08 could not move the new app in" });
    s.settings.pendingInstall = "1.5.0"; // app is 1.4.0
    s.updater.reportPendingInstall();
    expect(s.report).toHaveBeenCalledTimes(1);
    const [key, error] = s.report.mock.calls[0]! as [string, Error];
    expect(key).toBe("updater.install.1.5.0");
    expect(error.message).toContain("did not install");
    expect(error.message).toContain("could not move the new app in");
    expect(s.settings.pendingInstall).toBeNull();
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "install-failed", version: "1.5.0" });
    s.updater.reportPendingInstall();
    expect(s.report).toHaveBeenCalledTimes(1);
  });

  it("is cleared without a report once the app has caught up", () => {
    const s = setup();
    s.settings.pendingInstall = "1.4.0"; // app is 1.4.0
    s.updater.reportPendingInstall();
    expect(s.report).not.toHaveBeenCalled();
    expect(s.settings.pendingInstall).toBeNull();
  });

  it("is cleared without a report when the app is already newer", () => {
    const s = setup({ appVersion: "1.6.0" });
    s.settings.pendingInstall = "1.5.0";
    s.updater.reportPendingInstall();
    expect(s.report).not.toHaveBeenCalled();
    expect(s.settings.pendingInstall).toBeNull();
  });

  it("does nothing when no install was handed off", () => {
    const s = setup();
    s.updater.reportPendingInstall();
    expect(s.report).not.toHaveBeenCalled();
  });

  it("writes the note before the Mac script starts, and clears it when the script cannot start", async () => {
    const s = setup({ target: "mac-arm64" });
    await settle(s.updater);
    s.installMac.mockImplementation(() => {
      expect(s.settings.pendingInstall).toBe("1.5.0");
      throw new Error("spawn failed");
    });
    expect(s.updater.installAtQuit(7)).toBe(false);
    expect(s.settings.pendingInstall).toBeNull();
  });

  it("starts no Mac install after the quit has gone ahead without the cleanup", async () => {
    const s = setup({ target: "mac-arm64" });
    await settle(s.updater);
    s.updater.closeInstalls();
    expect(s.updater.installAtQuit(7)).toBe(false);
    expect(s.installMac).not.toHaveBeenCalled();
  });
});

describe("Linux (DEC-174)", () => {
  it("is manual with the version, notes and release page, and downloads nothing", async () => {
    const s = setup({ target: "linux-x64" });
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({
      status: "manual",
      manualReason: "linux",
      version: "1.5.0",
      notes: "Notes for 1.5.0",
      releaseUrl: "https://github.com/stuchain/CuePoint/releases/tag/v1.5.0",
      error: null,
    });
    expect(s.win.checks).toBe(0);
    expect(s.prepareMac).not.toHaveBeenCalled();
    expect(s.updater.restart()).toBe(false);
    expect(s.updater.installAtQuit(1)).toBe(false);
  });

  it("is up to date when nothing is newer", async () => {
    const s = setup({ target: "linux-x64", releases: [] });
    await settle(s.updater);
    expect(s.updater.getState().status).toBe("up-to-date");
  });
});

describe("the test feed", () => {
  const feed = "https://updates.example.test/feed";

  it("replaces the list address and the download base on a test version", async () => {
    const s = setup({
      appVersion: "1.4.0-test.1",
      env: { CUEPOINT_UPDATE_FEED: feed },
      releases: [release("1.5.0-test.1", "win-x64")],
    });
    await settle(s.updater);
    expect(s.listCalls[0]).toMatchObject({ url: `${feed}/releases.json` });
    expect(s.win.feeds[0]!.url).toBe(`${feed}/v1.5.0-test.1/`);
  });

  it("is ignored by a normal version", async () => {
    const s = setup({ env: { CUEPOINT_UPDATE_FEED: feed } });
    await settle(s.updater);
    expect(s.listCalls[0]!.url).toBeUndefined();
    expect(s.win.feeds[0]!.url).toBe("https://github.com/stuchain/CuePoint/releases/download/v1.5.0/");
  });

  it.each([
    ["plain http", "http://updates.example.test/feed"],
    ["a file address", "file:///tmp/feed"],
    ["not a URL", "feed"],
  ])("is refused as %s", async (_what, bad) => {
    const s = setup({ appVersion: "1.4.0-test.1", env: { CUEPOINT_UPDATE_FEED: bad } });
    await settle(s.updater);
    expect(s.listCalls[0]!.url).toBeUndefined();
  });

  it("allows http on this computer, read by the updater's own reader", async () => {
    const calls: string[] = [];
    const body = [
      {
        tag_name: "v1.5.0-test.1",
        draft: false,
        prerelease: true,
        body: "Local notes",
        html_url: "https://github.com/stuchain/CuePoint/releases/tag/v1.5.0-test.1",
        assets: [
          { name: "latest.yml", browser_download_url: "http://127.0.0.1:8000/a" },
          { name: "CuePoint-1.5.0-test.1-win-x64-setup.exe", browser_download_url: "http://127.0.0.1:8000/b" },
        ],
      },
    ];
    const s = setup({
      appVersion: "1.4.0-test.1",
      env: { CUEPOINT_UPDATE_FEED: "http://127.0.0.1:8000" },
      fetchImpl: (async (input: string | URL | Request) => {
        calls.push(String(input));
        return new Response(JSON.stringify(body));
      }) as typeof fetch,
    });
    await settle(s.updater);
    expect(calls).toEqual(["http://127.0.0.1:8000/releases.json"]);
    expect(s.listCalls).toHaveLength(0);
    expect(s.win.feeds[0]!.url).toBe("http://127.0.0.1:8000/v1.5.0-test.1/");
    expect(s.updater.getState()).toMatchObject({ status: "ready", version: "1.5.0-test.1" });
  });

  it("says could not check when the local feed cannot be read", async () => {
    const s = setup({
      appVersion: "1.4.0-test.1",
      env: { CUEPOINT_UPDATE_FEED: "http://localhost:8000" },
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    await settle(s.updater);
    expect(s.updater.getState()).toMatchObject({ status: "failed", error: "could-not-check" });
    expect(s.report).not.toHaveBeenCalled();
  });
});

describe("subscribing", () => {
  it("sends every state change to a listener until it unsubscribes", async () => {
    const s = setup({ releases: [] });
    const seen: string[] = [];
    const unsubscribe = s.updater.subscribe((state) => seen.push(state.status));
    await settle(s.updater);
    expect(seen).toEqual(["checking", "up-to-date"]);
    unsubscribe();
    await settle(s.updater);
    expect(seen).toEqual(["checking", "up-to-date"]);
  });

  it("hands out copies a listener cannot change", async () => {
    const s = setup({ releases: [] });
    const state = s.updater.getState();
    state.status = "ready";
    expect(s.updater.getState().status).toBe("idle");
  });
});
