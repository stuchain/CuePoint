/**
 * The preload is found in a packaged app as well as from source (CLEAN-14).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { resolvePreloadPath } from "./engineSupervisor";

const here = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(here, "..");

describe("resolvePreloadPath", () => {
  it("finds the preload beside the bundle, from source", () => {
    const found = resolvePreloadPath(path.join(DESKTOP_ROOT, "electron-dist"));
    expect(found).toBe(path.join(DESKTOP_ROOT, "electron", "preload.cjs"));
    expect(fs.existsSync(found)).toBe(true);
  });

  it("stays inside the packaged app, where electron-builder puts it", () => {
    const asar = path.join("C:", "Program Files", "CuePoint", "resources", "app.asar");
    expect(resolvePreloadPath(path.join(asar, "electron-dist"))).toBe(
      path.join(asar, "electron", "preload.cjs"),
    );
  });

  it("names a file the package ships", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, "package.json"), "utf-8"));
    const shipped: string[] = pkg.build.files;
    expect(shipped).toContain("electron/preload.cjs");
    expect(shipped).toContain("electron-dist/**/*");
  });
});
