/**
 * The packaged app's builder config.
 *
 * Icons (DIST-09): every icon the config names exists.
 *
 * Updates (DIST-03): every build carries what an updater needs. The Mac targets are dmg and zip
 * (the zip is what the installed app downloads), and file names carry the system and chip. The
 * `publish` entry is the generic provider and exists only so electron-builder writes the update
 * manifests (latest.yml, latest-mac.yml, latest-linux.yml) and the .blockmap files; its URL is not
 * used at run time (DIST-06 points the updater at the chosen release). Building never uploads:
 * the scripts that run electron-builder say `--publish never`.
 *
 * Channel: electron-builder reads the channel from a prerelease version, so 1.0.0-test.1 would
 * write test.yml, test-mac.yml and test-linux.yml. The publish entry therefore pins
 * `channel: "latest"` and `detectUpdateChannel` is off, so every version, test builds included,
 * writes the latest*.yml names the updater and the release workflow look for.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(here, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, "package.json"), "utf-8"));

describe("electron-builder icons", () => {
  const entries: [string, string | undefined][] = [
    ["build.win.icon", pkg.build.win?.icon],
    ["build.mac.icon", pkg.build.mac?.icon],
    ["build.linux.icon", pkg.build.linux?.icon],
    ["build.nsis.installerIcon", pkg.build.nsis?.installerIcon],
    ["build.nsis.uninstallerIcon", pkg.build.nsis?.uninstallerIcon],
  ];

  it.each(entries)("%s points at something that exists", (_name, value) => {
    expect(value).toBeTruthy();
    expect(fs.existsSync(path.join(DESKTOP_ROOT, value as string))).toBe(true);
  });

  it.each(["icon.png", "icon.ico"])(
    "copies build/%s to the resources folder for the window icon",
    (file) => {
      const extra: { from: string; to: string }[] = pkg.build.extraResources;
      const entry = extra.find((e) => e.to === file);
      expect(entry).toEqual({ from: `build/${file}`, to: file });
      expect(fs.existsSync(path.join(DESKTOP_ROOT, entry!.from))).toBe(true);
    },
  );
});

describe("electron-builder targets and file names (DIST-03)", () => {
  const targetNames = (t: unknown[]): string[] =>
    t.map((x) => (typeof x === "string" ? x : (x as { target: string }).target));

  it("builds nsis on Windows, dmg and zip on macOS, AppImage on Linux", () => {
    expect(targetNames(pkg.build.win.target)).toEqual(["nsis"]);
    expect(targetNames(pkg.build.mac.target)).toEqual(["dmg", "zip"]);
    expect(targetNames(pkg.build.linux.target)).toEqual(["AppImage"]);
  });

  it("names each file by system and chip (electron-builder maps x64 to x86_64 for AppImage)", () => {
    expect(pkg.build.nsis.artifactName).toBe("CuePoint-${version}-win-${arch}-setup.${ext}");
    expect(pkg.build.mac.artifactName).toBe("CuePoint-${version}-mac-${arch}.${ext}");
    expect(pkg.build.linux.artifactName).toBe("CuePoint-${version}-linux-${arch}.${ext}");
  });

  it("publishes with the generic provider so the update manifests are written", () => {
    expect(pkg.build.publish).toEqual([
      {
        provider: "generic",
        url: "https://github.com/stuchain/CuePoint/releases/latest/download",
        channel: "latest",
      },
    ]);
    expect(pkg.build.detectUpdateChannel).toBe(false);
  });

  // electron-builder's own resolution, for a test version and a normal one: the channel decides
  // the manifest's file name (`<channel>.yml`, `<channel>-mac.yml`, `<channel>-linux.yml`).
  it.each(["1.0.0-test.1", "1.0.0"])(
    "resolves the %s channel to latest, so the manifests are latest*.yml",
    async (version: string) => {
      const require = createRequire(import.meta.url);
      const { getPublishConfigs } = require("app-builder-lib/out/publish/PublishManager");
      const semver = require("semver");
      const prerelease = semver.prerelease(version);
      const appInfo = { version, channel: prerelease?.length ? prerelease[0] : null };
      const info = { config: pkg.build, appInfo };
      for (const platform of ["win", "mac", "linux"]) {
        const packager = {
          platformSpecificBuildOptions: pkg.build[platform],
          config: pkg.build,
          info,
          appInfo,
          expandMacro: (v: string) => v,
        };
        const configs = await getPublishConfigs(packager, null, 1, false);
        expect(configs).toHaveLength(1);
        expect(configs[0].channel).toBe("latest");
      }
    },
  );

  it.each(["dist", "package", "pack"])("`npm run %s` never uploads", (script) => {
    expect(pkg.scripts[script]).toContain("electron-builder");
    expect(pkg.scripts[script]).toContain("--publish never");
  });

  it("keeps pack as a directory build", () => {
    expect(pkg.scripts.pack).toContain("--dir");
  });
});
