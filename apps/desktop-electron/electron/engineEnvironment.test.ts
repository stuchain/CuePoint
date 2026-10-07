/**
 * What the engine is told when it is spawned (WAVE-01, DEC-123).
 *
 * The engine analyses audio with the player's mpv, and only this process knows
 * where that is. So the decoder the player would use is named to the engine as
 * `CUEPOINT_DECODER_PATH`, from the same resolution, and nothing else is: an
 * inherited value is removed when there is no decoder, so the engine never
 * analyses with a binary the app did not choose.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { engineEnvironment } from "./engineSupervisor";
import { DECODER_PATH_ENV, resolvePlayerBinary, withDecoderPath } from "./playerLaunch";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const base = {
  port: 51234,
  token: "secret",
  sessionId: "session",
  parentPid: 4242,
  errorReporting: false,
};

/** The decoder path an engine would be given, for one way of finding mpv. */
function decoderFor(options: Parameters<typeof resolvePlayerBinary>[0]): string | undefined {
  const decoder = resolvePlayerBinary(options)?.path ?? null;
  return engineEnvironment({ ...base, decoderPath: decoder, env: {} })[DECODER_PATH_ENV];
}

describe("the engine's environment", () => {
  it("carries the loopback address, the token, the session and this process", () => {
    const env = engineEnvironment({ ...base, decoderPath: null, env: { HOME: "/home/dj" } });
    expect(env).toMatchObject({
      HOME: "/home/dj",
      CUEPOINT_HOST: "127.0.0.1",
      CUEPOINT_PORT: "51234",
      CUEPOINT_TOKEN: "secret",
      CUEPOINT_SESSION_ID: "session",
      CUEPOINT_HEADLESS: "1",
      CUEPOINT_PARENT_PID: "4242",
    });
  });

  it("names the bundled mpv in a packaged app", () => {
    const bundled = path.join("/Applications/CuePoint.app/Contents/Resources", "player", "mpv.exe");
    expect(
      decoderFor({
        packaged: true,
        resourcesPath: "/Applications/CuePoint.app/Contents/Resources",
        platform: "win32",
        env: {},
        exists: (candidate) => candidate === bundled,
      }),
    ).toBe(bundled);
  });

  it("names the mpv CUEPOINT_MPV_PATH names, packaged or not", () => {
    for (const packaged of [true, false]) {
      expect(
        decoderFor({
          packaged,
          resourcesPath: "/r",
          repoRoot: "/repo",
          env: { CUEPOINT_MPV_PATH: "/usr/bin/mpv" },
          exists: () => false,
        }),
      ).toBe("/usr/bin/mpv");
    }
  });

  it("names the fetched mpv in a development checkout", () => {
    const fetched = path.join("/repo", "apps", "desktop-electron", "resources", "player", "linux-x64", "mpv");
    expect(
      decoderFor({
        packaged: false,
        repoRoot: "/repo",
        platform: "linux",
        arch: "x64",
        env: {},
        exists: (candidate) => candidate === fetched,
      }),
    ).toBe(fetched);
  });

  it("names none when there is no mpv, as on Linux with nothing set", () => {
    expect(
      decoderFor({ packaged: true, resourcesPath: "/r", platform: "linux", env: {}, exists: () => false }),
    ).toBeUndefined();
  });

  it("removes an inherited decoder when there is none of its own", () => {
    const env = engineEnvironment({
      ...base,
      decoderPath: null,
      env: { [DECODER_PATH_ENV]: "/somewhere/else/mpv" },
    });
    expect(env[DECODER_PATH_ENV]).toBeUndefined();
    expect(DECODER_PATH_ENV in env).toBe(false);
  });

  it("replaces an inherited decoder with the one resolved", () => {
    const env = engineEnvironment({
      ...base,
      decoderPath: "/bundled/mpv",
      env: { [DECODER_PATH_ENV]: "/somewhere/else/mpv" },
    });
    expect(env[DECODER_PATH_ENV]).toBe("/bundled/mpv");
  });
});

describe("the error-reporting choice (REPORT-01, DEC-128)", () => {
  it("is 1 when on and 0 when off", () => {
    expect(engineEnvironment({ ...base, decoderPath: null, errorReporting: true, env: {} })).toMatchObject({
      CUEPOINT_ERROR_REPORTING: "1",
    });
    expect(engineEnvironment({ ...base, decoderPath: null, errorReporting: false, env: {} })).toMatchObject({
      CUEPOINT_ERROR_REPORTING: "0",
    });
  });

  it("overrides an inherited value", () => {
    const inherited = { CUEPOINT_ERROR_REPORTING: "1" };
    expect(
      engineEnvironment({ ...base, decoderPath: null, errorReporting: false, env: inherited })
        .CUEPOINT_ERROR_REPORTING,
    ).toBe("0");
    expect(
      engineEnvironment({ ...base, decoderPath: null, errorReporting: true, env: { CUEPOINT_ERROR_REPORTING: "0" } })
        .CUEPOINT_ERROR_REPORTING,
    ).toBe("1");
  });
});

describe("naming the decoder", () => {
  it("sets the variable, and never changes the environment it was given", () => {
    const given: NodeJS.ProcessEnv = { PATH: "/bin" };
    const next = withDecoderPath(given, "/usr/bin/mpv");
    expect(next).toEqual({ PATH: "/bin", [DECODER_PATH_ENV]: "/usr/bin/mpv" });
    expect(given).toEqual({ PATH: "/bin" });
  });

  it("treats a blank path as none", () => {
    expect(withDecoderPath({ [DECODER_PATH_ENV]: "/x" }, "  ")[DECODER_PATH_ENV]).toBeUndefined();
  });

  it("uses the name the engine reads", () => {
    const python = fs.readFileSync(
      path.join(repoRoot, "src", "cuepoint", "data", "audio_decode.py"),
      "utf-8",
    );
    expect(python).toContain(`DECODER_PATH_ENV = "${DECODER_PATH_ENV}"`);
  });
});
