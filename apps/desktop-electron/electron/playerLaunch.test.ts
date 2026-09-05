import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  playerBinaryRelativePath,
  playerPlatformDir,
  playerUnavailableReason,
  resolvePlayerBinary,
} from "./playerLaunch";

/**
 * Path resolution for the mpv sidecar (PLAYER-03).
 *
 * Every platform is checked from every platform, which is the point of keeping
 * this module free of Electron and of `process.platform` defaults that cannot
 * be overridden: a macOS packaging mistake should fail on the Windows CI leg
 * too, not wait for someone to build on a Mac.
 */

const nothingExists = () => false;
const everythingExists = () => true;

describe("platform directories", () => {
  it("uses electron-builder's names, matching PLAYER-01's layout", () => {
    expect(playerPlatformDir("win32", "x64")).toBe("win-x64");
    expect(playerPlatformDir("darwin", "arm64")).toBe("mac-arm64");
    expect(playerPlatformDir("darwin", "x64")).toBe("mac-x64");
    expect(playerPlatformDir("linux", "x64")).toBe("linux-x64");
  });

  it("has no answer for a platform CuePoint does not ship", () => {
    expect(playerPlatformDir("freebsd" as NodeJS.Platform, "x64")).toBeNull();
    expect(playerPlatformDir("win32", "ia32")).toBeNull();
  });
});

describe("binary location inside an install", () => {
  it("is a bare executable on Windows and Linux", () => {
    expect(playerBinaryRelativePath("win32")).toBe("mpv.exe");
    expect(playerBinaryRelativePath("linux")).toBe("mpv");
  });

  it("is inside the application bundle on macOS", () => {
    // The macOS artifact is an .app, not a bare binary; pointing at the wrong
    // level produces a "player unavailable" that looks like a packaging bug.
    expect(playerBinaryRelativePath("darwin")).toBe(
      path.join("mpv.app", "Contents", "MacOS", "mpv"),
    );
  });
});

describe("resolving the binary", () => {
  it("prefers CUEPOINT_MPV_PATH over everything", () => {
    const resolved = resolvePlayerBinary({
      packaged: true,
      resourcesPath: "/app/resources",
      env: { CUEPOINT_MPV_PATH: "/usr/bin/mpv" },
      platform: "linux",
      arch: "x64",
      exists: everythingExists,
    });
    expect(resolved).toEqual({ path: "/usr/bin/mpv", source: "env" });
  });

  it("honours the override in packaged builds, not only in development", () => {
    // Linux packages bundle no mpv at all, so for those users the override is
    // the only way to have audio.
    const resolved = resolvePlayerBinary({
      packaged: true,
      resourcesPath: "/app/resources",
      env: { CUEPOINT_MPV_PATH: "/usr/bin/mpv" },
      platform: "linux",
      arch: "x64",
      exists: nothingExists,
    });
    expect(resolved?.source).toBe("env");
  });

  it("trusts the override even when the file is missing", () => {
    // Someone who set this and mistyped it should see an error naming their
    // path, not silently get a different binary.
    const resolved = resolvePlayerBinary({
      packaged: false,
      repoRoot: "/repo",
      env: { CUEPOINT_MPV_PATH: "/nope/mpv" },
      platform: "linux",
      arch: "x64",
      exists: nothingExists,
    });
    expect(resolved).toEqual({ path: "/nope/mpv", source: "env" });
  });

  it("ignores a blank override", () => {
    const resolved = resolvePlayerBinary({
      packaged: false,
      repoRoot: "/repo",
      env: { CUEPOINT_MPV_PATH: "   " },
      platform: "win32",
      arch: "x64",
      exists: everythingExists,
    });
    expect(resolved?.source).toBe("development");
  });

  it("finds the bundled sidecar in a packaged app", () => {
    const resolved = resolvePlayerBinary({
      packaged: true,
      resourcesPath: path.join("/app", "resources"),
      env: {},
      platform: "win32",
      arch: "x64",
      exists: everythingExists,
    });
    expect(resolved).toEqual({
      path: path.join("/app", "resources", "player", "mpv.exe"),
      source: "bundled",
    });
  });

  it("finds the macOS bundle inside a packaged app", () => {
    const resolved = resolvePlayerBinary({
      packaged: true,
      resourcesPath: path.join("/App.app", "Contents", "Resources"),
      env: {},
      platform: "darwin",
      arch: "arm64",
      exists: everythingExists,
    });
    expect(resolved?.path).toBe(
      path.join("/App.app", "Contents", "Resources", "player", "mpv.app", "Contents", "MacOS", "mpv"),
    );
  });

  it("finds the fetched sidecar in a checkout", () => {
    const resolved = resolvePlayerBinary({
      packaged: false,
      repoRoot: path.join("/repo"),
      env: {},
      platform: "darwin",
      arch: "arm64",
      exists: everythingExists,
    });
    expect(resolved).toEqual({
      path: path.join(
        "/repo",
        "apps",
        "desktop-electron",
        "resources",
        "player",
        "mac-arm64",
        "mpv.app",
        "Contents",
        "MacOS",
        "mpv",
      ),
      source: "development",
    });
  });

  it("reports absence rather than throwing when nothing is installed", () => {
    // A checkout where nobody ran the fetch script still has to run.
    expect(
      resolvePlayerBinary({
        packaged: false,
        repoRoot: "/repo",
        env: {},
        platform: "win32",
        arch: "x64",
        exists: nothingExists,
      }),
    ).toBeNull();
  });

  it("reports absence in a packaged build with no bundled player", () => {
    expect(
      resolvePlayerBinary({
        packaged: true,
        resourcesPath: "/app/resources",
        env: {},
        platform: "linux",
        arch: "x64",
        exists: nothingExists,
      }),
    ).toBeNull();
  });

  it("does not fall back to a development path from a packaged build", () => {
    // A packaged app must never reach into a developer's checkout.
    const resolved = resolvePlayerBinary({
      packaged: true,
      resourcesPath: "/app/resources",
      repoRoot: "/repo",
      env: {},
      platform: "win32",
      arch: "x64",
      exists: (candidate) => candidate.includes("repo"),
    });
    expect(resolved).toBeNull();
  });

  it("has no answer on an unsupported architecture", () => {
    expect(
      resolvePlayerBinary({
        packaged: false,
        repoRoot: "/repo",
        env: {},
        platform: "linux",
        arch: "ppc64",
        exists: everythingExists,
      }),
    ).toBeNull();
  });
});

describe("explaining why there is no player", () => {
  it("tells a developer which script to run", () => {
    const reason = playerUnavailableReason({ packaged: false, platform: "win32", arch: "x64" });
    expect(reason).toContain("fetch_player_sidecar.py");
  });

  it("tells a user of a packaged build about the override", () => {
    const reason = playerUnavailableReason({ packaged: true, platform: "linux", arch: "x64" });
    expect(reason).toContain("CUEPOINT_MPV_PATH");
    expect(reason).not.toContain("fetch_player_sidecar.py");
  });

  it("says plainly when the platform is not supported at all", () => {
    const reason = playerUnavailableReason({
      packaged: true,
      platform: "freebsd" as NodeJS.Platform,
      arch: "x64",
    });
    expect(reason).toMatch(/not supported/i);
  });
});
