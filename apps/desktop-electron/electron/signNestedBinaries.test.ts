/**
 * afterPack signing (DIST-02, DEC-170): with no identity the bundle is signed ad hoc, inside out,
 * so `codesign --verify --deep --strict` accepts it; with an identity only the sidecars are signed
 * here, as before. afterSign (notarize) stays a no-op without Apple credentials.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const hook = require("../build/signNestedBinaries.cjs");
const notarize = require("../build/notarize.cjs");

let root: string;

function touch(rel: string, exec = false) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "x");
  if (exec) fs.chmodSync(full, 0o755);
}

function context(platform = "darwin") {
  return {
    electronPlatformName: platform,
    appOutDir: root,
    packager: { appInfo: { productFilename: "CuePoint" } },
  };
}

const APP = () => path.join(root, "CuePoint.app");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sign-test-"));
  touch("CuePoint.app/Contents/MacOS/CuePoint", true);
  touch("CuePoint.app/Contents/Resources/engine/cuepoint-engine", true);
  touch("CuePoint.app/Contents/Resources/engine/data.txt");
  touch("CuePoint.app/Contents/Resources/player/mpv.app/Contents/MacOS/mpv", true);
  touch("CuePoint.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework", true);
  touch("CuePoint.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper", true);
  vi.spyOn(console, "log").mockImplementation(() => {});
  delete process.env.CSC_NAME;
  delete process.env.CUEPOINT_SIGN_IDENTITY;
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("ad hoc signing without an identity", () => {
  it("signs sidecars, then frameworks and helpers, then the app last", async () => {
    const calls: string[][] = [];
    await hook.default(context(), { exec: (_c: string, args: string[]) => calls.push(args) });
    const targets = calls.map((a) => a[a.length - 1]);
    const at = (suffix: string) => targets.findIndex((t) => t.endsWith(suffix));

    expect(targets[targets.length - 1]).toBe(APP());
    expect(targets.filter((t) => t === APP())).toHaveLength(1);
    expect(at("engine/cuepoint-engine")).toBeGreaterThanOrEqual(0);
    expect(at("player/mpv.app")).toBeGreaterThan(at("player/mpv.app/Contents/MacOS/mpv"));
    // Every sidecar before any framework, every framework item before the app.
    const lastSidecar = Math.max(at("engine/cuepoint-engine"), at("player/mpv.app"));
    const firstFramework = Math.min(at("Electron Framework.framework"), at("Electron Helper.app"));
    expect(lastSidecar).toBeLessThan(firstFramework);
    // A bundle after its own contents.
    expect(at("Electron Helper.app")).toBeGreaterThan(at("Electron Helper.app/Contents/MacOS/Electron Helper"));
    expect(at("Electron Framework.framework")).toBeGreaterThan(
      at("Electron Framework.framework/Versions/A/Electron Framework"),
    );
    // Non-executable data is not signed on its own.
    expect(targets.some((t) => t.endsWith("data.txt"))).toBe(false);
  });

  it("uses '-', the hardened runtime, no timestamp and the entitlements", async () => {
    const calls: string[][] = [];
    await hook.default(context(), { exec: (_c: string, args: string[]) => calls.push(args) });
    const buildDir = path.resolve(__dirname, "..", "build");
    for (const args of calls) {
      expect(args.slice(0, 7)).toEqual([
        "--force", "--sign", "-", "--options", "runtime", "--timestamp=none", "--entitlements",
      ]);
    }
    const ent = (suffix: string) => calls.find((a) => a[a.length - 1].endsWith(suffix))![7];
    expect(ent("engine/cuepoint-engine")).toBe(path.join(buildDir, "entitlements.mac.plist"));
    expect(ent("Electron Helper.app")).toBe(path.join(buildDir, "entitlements.mac.inherit.plist"));
    expect(calls[calls.length - 1][7]).toBe(path.join(buildDir, "entitlements.mac.plist"));
  });

  it("does not follow symlinks", async () => {
    fs.symlinkSync(
      path.join(root, "CuePoint.app/Contents/Resources/engine/cuepoint-engine"),
      path.join(root, "CuePoint.app/Contents/Resources/engine/link"),
    );
    const calls: string[][] = [];
    await hook.default(context(), { exec: (_c: string, args: string[]) => calls.push(args) });
    expect(calls.some((a) => a[a.length - 1].endsWith("/link"))).toBe(false);
  });

  it("does nothing off macOS", async () => {
    const exec = vi.fn();
    await hook.default(context("linux"), { exec });
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("signing with an identity (unchanged)", () => {
  it("signs only the sidecars, with the identity and a timestamp", async () => {
    process.env.CSC_NAME = "Developer ID Application: Someone (TEAM)";
    const calls: string[][] = [];
    await hook.default(context(), { exec: (_c: string, args: string[]) => calls.push(args) });
    const targets = calls.map((a) => a[a.length - 1]);
    expect(targets.some((t) => t.includes("Frameworks"))).toBe(false);
    expect(targets).not.toContain(APP());
    expect(targets.some((t) => t.endsWith("engine/cuepoint-engine"))).toBe(true);
    for (const args of calls) {
      expect(args.slice(0, 6)).toEqual([
        "--force", "--sign", "Developer ID Application: Someone (TEAM)", "--options", "runtime", "--timestamp",
      ]);
    }
  });
});

describe("notarization without credentials", () => {
  it("is a no-op", async () => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("APPLE_")) delete process.env[key];
    }
    await expect(notarize.default(context())).resolves.toBeUndefined();
  });
});
