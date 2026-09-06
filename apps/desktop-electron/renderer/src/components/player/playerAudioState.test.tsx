import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PLAYER_AUDIO_DEVICE_STORAGE_KEY,
  PLAYER_AUDIO_EXCLUSIVE_STORAGE_KEY,
  SYSTEM_DEFAULT_DEVICE,
  loadAudioSettings,
  saveAudioDevice,
  saveAudioExclusive,
  useRestorePlayerAudio,
} from "./playerAudioState";

/**
 * Remembering where the audio comes out (PLAYER-11, DEC-055).
 *
 * The part worth testing is not the round trip, it is what happens when the
 * stored value is wrong — and it will be. A device name is an opaque string
 * from mpv, and the same profile can be opened on a machine where it means
 * nothing. Nothing here may throw, and nothing may block startup.
 */

function Probe() {
  useRestorePlayerAudio();
  return null;
}

function install() {
  const setAudioSettings = vi.fn().mockResolvedValue({ ok: true });
  (window as unknown as { cuepoint?: unknown }).cuepoint = { player: { setAudioSettings } };
  return { setAudioSettings };
}

beforeEach(() => localStorage.clear());

afterEach(() => {
  localStorage.clear();
  delete (window as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("storage", () => {
  it("defaults to the system default, shared", () => {
    expect(loadAudioSettings()).toEqual({ device: SYSTEM_DEFAULT_DEVICE, exclusive: false });
  });

  it("remembers a device and the exclusive choice", () => {
    saveAudioDevice("wasapi/{interface}");
    saveAudioExclusive(true);

    expect(loadAudioSettings()).toEqual({ device: "wasapi/{interface}", exclusive: true });
  });

  it("treats a blank stored device as absent", () => {
    localStorage.setItem(PLAYER_AUDIO_DEVICE_STORAGE_KEY, "   ");

    expect(loadAudioSettings().device).toBe(SYSTEM_DEFAULT_DEVICE);
  });

  it("treats anything but 1 as shared output", () => {
    localStorage.setItem(PLAYER_AUDIO_EXCLUSIVE_STORAGE_KEY, "yes please");

    expect(loadAudioSettings().exclusive).toBe(false);
  });

  it("survives storage that throws outright", () => {
    // A window with site data disabled throws on access rather than returning
    // null, and an app that will not start is a worse bug than a forgotten
    // preference.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(loadAudioSettings()).toEqual({ device: SYSTEM_DEFAULT_DEVICE, exclusive: false });
    expect(() => saveAudioDevice("wasapi/x")).not.toThrow();
    expect(() => saveAudioExclusive(true)).not.toThrow();
  });
});

describe("restoring at startup", () => {
  it("tells main what was remembered", async () => {
    // Before the first track, not when Settings is opened: most sessions never
    // open Settings, and the chosen interface has to be in use from track one.
    saveAudioDevice("wasapi/{interface}");
    saveAudioExclusive(true);
    const harness = install();

    render(<Probe />);

    expect(harness.setAudioSettings).toHaveBeenCalledWith({
      device: "wasapi/{interface}",
      exclusive: true,
    });
  });

  it("says nothing when there is nothing to say", () => {
    // Pushing the defaults would start the player process on a machine where
    // nobody has pressed play, undoing PLAYER-03's lazy start.
    const harness = install();

    render(<Probe />);

    expect(harness.setAudioSettings).not.toHaveBeenCalled();
  });

  it("restores exclusive output on its own", () => {
    saveAudioExclusive(true);
    const harness = install();

    render(<Probe />);

    expect(harness.setAudioSettings).toHaveBeenCalledWith({
      device: SYSTEM_DEFAULT_DEVICE,
      exclusive: true,
    });
  });

  it("does not fail the app when the player refuses", async () => {
    saveAudioDevice("wasapi/{interface}");
    const harness = install();
    harness.setAudioSettings.mockRejectedValue(new Error("no player"));

    expect(() => render(<Probe />)).not.toThrow();
    // The rejection is handled rather than left to surface as an unhandled one.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it("does nothing without a bridge", () => {
    saveAudioDevice("wasapi/{interface}");

    expect(() => render(<Probe />)).not.toThrow();
  });

  it("does nothing with a bridge too old to know about audio settings", () => {
    saveAudioDevice("wasapi/{interface}");
    (window as unknown as { cuepoint?: unknown }).cuepoint = { player: {} };

    expect(() => render(<Probe />)).not.toThrow();
  });
});
