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
/** Files made executable: Windows keeps no execute bit, so their mode is reported from here. */
let executables: Set<string>;

function touch(rel: string, exec = false) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, "x");
  if (exec) {
    fs.chmodSync(full, 0o755);
    executables.add(full);
  }
}

/** electron-builder's `Arch.arm64` and `Arch.x64`. */
const ARM64 = 3;
const X64 = 1;

function context(platform = "darwin", arch = ARM64) {
  return {
    electronPlatformName: platform,
    arch,
    appOutDir: root,
    packager: { appInfo: { productFilename: "CuePoint" } },
  };
}

/** The shape of the Info.plist electron-builder leaves: XML, Electron's own minimum already in it. */
const ELECTRON_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>CuePoint</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
</dict>
</plist>
`;

const APP = () => path.join(root, "CuePoint.app");
const plist = () => fs.readFileSync(path.join(APP(), "Contents", "Info.plist"), "utf8");
/** Every `LSMinimumSystemVersion` value in the app's Info.plist. */
const minimums = () => [...plist().matchAll(/<key>LSMinimumSystemVersion<\/key>\s*<string>([^<]*)<\/string>/g)].map((m) => m[1]);
/** A signed path with forward slashes, so the suffix checks read the same on Windows. */
const slashed = (p: string) => p.split(path.sep).join("/");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "sign-test-"));
  executables = new Set();
  if (process.platform === "win32") {
    const statSync = fs.statSync;
    vi.spyOn(fs, "statSync").mockImplementation(((target: fs.PathLike, options?: fs.StatSyncOptions) => {
      const stats = statSync(target, options) as fs.Stats;
      if (executables.has(String(target))) stats.mode |= 0o111;
      return stats;
    }) as typeof fs.statSync);
  }
  touch("CuePoint.app/Contents/MacOS/CuePoint", true);
  fs.writeFileSync(path.join(root, "CuePoint.app/Contents/Info.plist"), ELECTRON_PLIST);
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
    const at = (suffix: string) => targets.findIndex((t) => slashed(t).endsWith(suffix));

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

  it("signs a framework's helpers before the framework's own binary", async () => {
    // codesign refuses "Versions/A/Electron Framework" while Helpers/chrome_crashpad_handler beside
    // it is unsigned ("code object is not signed at all, In subcomponent"); the Intel Mac build
    // read the binary before the folder and failed.
    touch(
      "CuePoint.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler",
      true,
    );
    const calls: string[][] = [];
    await hook.default(context(), { exec: (_c: string, args: string[]) => calls.push(args) });
    const targets = calls.map((a) => slashed(a[a.length - 1]));
    const at = (suffix: string) => targets.findIndex((t) => t.endsWith(suffix));
    expect(at("Versions/A/Helpers/chrome_crashpad_handler")).toBeGreaterThanOrEqual(0);
    expect(at("Versions/A/Helpers/chrome_crashpad_handler")).toBeLessThan(
      at("Versions/A/Electron Framework"),
    );
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
    const ent = (suffix: string) => calls.find((a) => slashed(a[a.length - 1]).endsWith(suffix))![7];
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
    expect(calls.some((a) => slashed(a[a.length - 1]).endsWith("/link"))).toBe(false);
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
    expect(targets.some((t) => slashed(t).endsWith("engine/cuepoint-engine"))).toBe(true);
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

describe("the oldest macOS the app opens on (ELECTRON-5, PYTHON-1E, DEC-296)", () => {
  const exec = () => undefined;

  it("is the bundled mpv's own minimum for each chip, read from the pinned manifest", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../../scripts/player_sidecar_manifest.json"), "utf8"),
    );
    // mpv's builds: macos-14-arm runs on 14 and newer, macos-15-intel on 15 and newer.
    expect(hook.macMinimumFor("arm64", manifest)).toBe("14.0");
    expect(hook.macMinimumFor("x64", manifest)).toBe("15.0");
  });

  it("follows a re-pinned asset", () => {
    const manifest = { targets: { "darwin-x64": { asset: "mpv-v1-123-macos-13-intel.zip" } } };
    expect(hook.macMinimumFor("x64", manifest)).toBe("13.0");
  });

  it.each([
    ["no target for the chip", { targets: {} }, "x64"],
    ["an asset with no macOS in its name", { targets: { "darwin-x64": { asset: "mpv.zip" } } }, "x64"],
    ["a universal build", { targets: {} }, "universal"],
  ])("refuses to guess with %s", (_label, manifest, arch) => {
    expect(() => hook.macMinimumFor(arch, manifest)).toThrow(/oldest macOS/);
  });

  it.each([
    [ARM64, "14.0"],
    [X64, "15.0"],
  ])("writes it into the app's Info.plist before signing (arch %s)", async (arch, expected) => {
    await hook.default(context("darwin", arch), { exec });
    expect(minimums()).toEqual([expected]);
    expect(plist()).toContain("<key>CFBundleName</key>");
  });

  it("adds the entry when Electron's is missing", () => {
    fs.writeFileSync(path.join(APP(), "Contents", "Info.plist"), ELECTRON_PLIST.replace(/\s*<key>LSMinimumSystemVersion<\/key>\s*<string>11.0<\/string>/, ""));
    hook.setMacMinimum(APP(), "15.0");
    expect(minimums()).toEqual(["15.0"]);
  });

  it("hands a binary Info.plist to plutil rather than editing it as text", () => {
    const file = path.join(APP(), "Contents", "Info.plist");
    fs.writeFileSync(file, "bplist00...");
    const calls: [string, string[]][] = [];
    hook.setMacMinimum(APP(), "15.0", (command: string, args: string[]) => calls.push([command, args]));
    expect(calls).toEqual([["plutil", ["-replace", "LSMinimumSystemVersion", "-string", "15.0", file]]]);
    expect(fs.readFileSync(file, "utf8")).toBe("bplist00...");
  });

  it("is written with an identity too, and not at all off macOS", async () => {
    process.env.CSC_NAME = "Developer ID Application: Test";
    await hook.default(context("darwin", X64), { exec });
    expect(minimums()).toEqual(["15.0"]);

    fs.writeFileSync(path.join(APP(), "Contents", "Info.plist"), ELECTRON_PLIST);
    await hook.default(context("win32", X64), { exec });
    expect(minimums()).toEqual(["11.0"]);
  });
});
