/** Which build this is (REPORT-07, DEC-126): one release, one dist and one environment. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { RELEASE_PREFIX, computeBuildInfo, currentBuildInfo, shortCommit } from "./buildInfo";
import { engineEnvironment } from "./engineSupervisor";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(desktopRoot, "package.json"), "utf-8")) as {
  version: string;
  scripts: Record<string, string>;
  build: { files: string[] };
};

describe("computeBuildInfo", () => {
  it("names the release cuepoint@<version>", () => {
    expect(computeBuildInfo({ version: "1.2.3-test.1", packaged: true }).release).toBe("cuepoint@1.2.3-test.1");
    expect(RELEASE_PREFIX).toBe("cuepoint@");
  });

  it("is production when packaged and development when run from source (DEC-150)", () => {
    expect(computeBuildInfo({ version: "1.0.0", packaged: true }).environment).toBe("production");
    expect(computeBuildInfo({ version: "1.0.0", packaged: false }).environment).toBe("development");
  });

  it("takes dist as the first seven characters of the commit, lower case", () => {
    const full = "E069C0A9D30F125488E8CA2BA7240E73EB124B62";
    expect(computeBuildInfo({ version: "1.0.0", commit: full, packaged: true }).dist).toBe("e069c0a");
    expect(shortCommit("abc1234")).toBe("abc1234");
  });

  it("has no dist when the build recorded no commit, and never invents one", () => {
    for (const commit of [undefined, null, "", "  ", "unknown", "not-a-commit", "abc12"]) {
      expect(computeBuildInfo({ version: "1.0.0", commit, packaged: true }).dist).toBeNull();
    }
  });
});

describe("currentBuildInfo", () => {
  it("is built from the version it is given: the app's, which the coupling check holds to version.py", () => {
    const info = currentBuildInfo(false, pkg.version);
    expect(info.version).toBe(pkg.version);
    expect(info.release).toBe(`cuepoint@${pkg.version}`);
    expect(info.environment).toBe("development");
    expect(currentBuildInfo(true, "1.0.0-test.1").environment).toBe("production");
  });
});

describe("main and the engine report one build", () => {
  it("passes the release, dist and environment to the engine, replacing inherited values", () => {
    const build = computeBuildInfo({ version: "1.0.0", commit: "abc1234def", packaged: true });
    const env = engineEnvironment({
      port: 1,
      token: "t",
      sessionId: "s",
      parentPid: 2,
      decoderPath: null,
      errorReporting: true,
      build,
      env: { CUEPOINT_RELEASE: "stale", CUEPOINT_DIST: "stale", CUEPOINT_ENVIRONMENT: "stale" },
    });
    expect(env).toMatchObject({
      CUEPOINT_RELEASE: "cuepoint@1.0.0",
      CUEPOINT_DIST: "abc1234",
      CUEPOINT_ENVIRONMENT: "production",
    });
  });

  it("passes an empty dist, not an inherited one, for a build with no commit", () => {
    const build = computeBuildInfo({ version: "1.0.0", packaged: false });
    const env = engineEnvironment({
      port: 1,
      token: "t",
      sessionId: "s",
      parentPid: 2,
      decoderPath: null,
      errorReporting: false,
      build,
      env: { CUEPOINT_DIST: "stale" },
    });
    expect(env.CUEPOINT_DIST).toBe("");
    expect(env.CUEPOINT_ENVIRONMENT).toBe("development");
  });
});

describe("source maps (REPORT-07)", () => {
  it("are written for main, and kept out of the packaged app", () => {
    const script = fs.readFileSync(path.join(desktopRoot, "build", "buildElectron.mjs"), "utf-8");
    expect(pkg.scripts["build:electron"]).toBe("node build/buildElectron.mjs");
    expect(script).toContain('sourcemap: "external"');
    expect(script).toContain("__CUEPOINT_COMMIT__");
    expect(pkg.build.files).toContain("!electron-dist/**/*.map");
    expect(pkg.build.files).toContain("!renderer/dist/**/*.map");
    // The SDKs' own maps are in `node_modules`, and are not shipped either.
    expect(pkg.build.files).toContain("!**/node_modules/**/*.map");
  });
});
