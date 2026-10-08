/** One version for the app, the engine, Sentry and the release (DIST-01, DEC-145, DEC-176). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { currentBuildInfo } from "./buildInfo";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, "package.json"), "utf-8")) as {
  version: string;
  cuepoint?: unknown;
};

/** `X.Y.Z` or `X.Y.Z-test.N`, with no leading zeros (DEC-145). */
const SCHEME = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-test\.[1-9]\d*)?$/;

describe("the app's version", () => {
  it("is package.json's version, in DEC-145's scheme and not the 0.0.0 placeholder", () => {
    expect(pkg.version).not.toBe("0.0.0");
    expect(pkg.version).toMatch(SCHEME);
  });

  it("is declared once: package.json no longer carries a separate engine version", () => {
    expect(pkg.cuepoint).toBeUndefined();
  });

  it("names the build and the release for the version it is given", () => {
    const info = currentBuildInfo(true, "1.0.0-test.1");
    expect(info.version).toBe("1.0.0-test.1");
    expect(info.release).toBe("cuepoint@1.0.0-test.1");
  });

  it("is what main passes: app.getVersion(), not a copy read from package.json", () => {
    const main = fs.readFileSync(path.join(here, "main.ts"), "utf-8");
    expect(main).toMatch(/const build = currentBuildInfo\(\s*app\.isPackaged\s*,\s*app\.getVersion\(\)\s*\)/);
    const buildInfo = fs.readFileSync(path.join(here, "buildInfo.ts"), "utf-8");
    expect(buildInfo).not.toMatch(/from\s+"\.\.\/package\.json"/);
  });
});
