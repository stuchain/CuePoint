/**
 * The packaged app's icons (DIST-09): every icon the builder config names exists.
 */
import fs from "node:fs";
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
