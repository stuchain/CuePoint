import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { MPV_RESAMPLER_ARGS } from "./mpvClient";
import { resolvePlayerBinary } from "./playerLaunch";
import { PlayerSupervisor } from "./playerSupervisor";

/**
 * The audio output, against the **real mpv** (PLAYER-11, DEC-055, DEC-005).
 *
 * Everything here is a claim about the bundled binary rather than about
 * CuePoint's own logic, and every one of them was wrong at least once when
 * assumed instead of checked.
 *
 * The one that matters most is the resampler. DEC-005's reasoning names SoX
 * resampling, and this build cannot do it — `--audio-swresample-o=resampler=soxr`
 * makes libswresample fail to initialise and every track that needs resampling
 * then fails to play. Shipping it would have been silence sold as quality. The
 * test below is what stops that being re-introduced, in either direction: if a
 * future mpv build *gains* libsoxr the assertion that it is missing fails and
 * the choice gets revisited on purpose.
 *
 * Skips when the sidecar was never fetched; CI fetches it on Windows and macOS.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
const FIXTURES = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio");
const fixture = (name: string) => path.join(FIXTURES, name);

const binary = resolvePlayerBinary({ packaged: false, repoRoot: REPO_ROOT, env: process.env });
const describeWithMpv = binary ? describe : describe.skip;

const supervisors: PlayerSupervisor[] = [];

function makePlayer(mpvArgs: string[] = ["--ao=null"]) {
  const player = new PlayerSupervisor({
    packaged: false,
    repoRoot: REPO_ROOT,
    env: process.env,
    mpvArgs,
    positionPushIntervalMs: 20,
  });
  supervisors.push(player);
  return player;
}

async function waitFor(
  predicate: () => boolean,
  { timeoutMs = 12_000, intervalMs = 25 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("timed out waiting for condition");
}

afterEach(async () => {
  for (const player of supervisors.splice(0)) await player.dispose();
});

describeWithMpv("the bundled player's audio output", () => {
  it("lists real devices, always including the system default", async () => {
    const player = makePlayer([]);

    const devices = await player.listAudioDevices();

    // `auto` is mpv's own name for "whatever the system is using" and is always
    // present; anything else depends on the machine, so only its shape is
    // asserted. Every entry must be selectable and showable.
    expect(devices.some((device) => device.name === "auto")).toBe(true);
    for (const device of devices) {
      expect(device.name).not.toBe("");
      expect(device.description).not.toBe("");
    }
  });

  it("accepts a device that does not exist, and finds out at the next file", async () => {
    // This is why the fallback is reactive rather than validated up front: mpv
    // takes any string here without complaint.
    const player = makePlayer([]);
    const failures: string[] = [];
    player.onEndFile((info) => {
      if (info.reason === "error") failures.push(info.error ?? "");
    });

    await player.setAudioSettings({ device: "wasapi/definitely-not-a-device" });
    await player.play(fixture("tone.flac"));

    await waitFor(() => failures.length > 0);
    // The exact text PLAYER-11's fallback keys off, and deliberately not the
    // "loading failed" that a missing *file* produces.
    expect(failures[0]!.toLowerCase()).toContain("audio output");
  });

  it("plays through the resampler settings the build actually supports", async () => {
    // A forced output rate the fixtures are not recorded at, so the resampler
    // has to run for the file to play at all.
    const player = makePlayer(["--ao=null", "--audio-samplerate=96000"]);
    const ended: string[] = [];
    player.onEndFile((info) => ended.push(info.reason));

    await player.play(fixture("tone.flac"));

    await waitFor(() => ended.length > 0);
    expect(ended[0]).toBe("eof");
    expect(MPV_RESAMPLER_ARGS).toContain("--audio-resample-filter-size=32");
  });

  it("has no SoX resampler, which is why one is not asked for", async () => {
    // The assertion is inverted on purpose. If a future bundled build gains
    // libsoxr this fails, and the resampler choice gets made again with the
    // evidence in front of whoever is making it — rather than staying at
    // second best for ever because nobody rechecked.
    const player = makePlayer([
      "--ao=null",
      "--audio-samplerate=96000",
      "--audio-swresample-o=resampler=soxr",
    ]);
    const ended: Array<{ reason: string; error?: string }> = [];
    player.onEndFile((info) => ended.push({ reason: info.reason, error: info.error }));

    await player.play(fixture("tone.flac"));

    await waitFor(() => ended.length > 0);
    expect(ended[0]!.reason).toBe("error");
  });

  it("keeps the user's choice after the player is restarted", async () => {
    const player = makePlayer([]);
    await player.setAudioSettings({ device: "auto", exclusive: false });
    await player.play(fixture("tone.flac"));

    await player.setAudioSettings({ device: "wasapi/gone" }, { remember: false });
    expect(player.getAudioState()).toMatchObject({
      device: "auto",
      activeDevice: "wasapi/gone",
    });

    await player.stop();
    await player.play(fixture("tone.flac"));

    // A fresh player gets what the user asked for, not what a fallback settled
    // on: restarting is the natural moment to try the interface again.
    expect(player.getAudioState().activeDevice).toBe("auto");
  });
});
