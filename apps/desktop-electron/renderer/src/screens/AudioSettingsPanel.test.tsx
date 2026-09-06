import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioState, PlayerSnapshot } from "../api/cuepointBridge.types";
import { EMPTY_AUDIO_STATE } from "../components/player/playerFormat";
import { resetPlayerStore } from "../components/player/playerStore";
import { PLAYER_AUDIO_DEVICE_STORAGE_KEY } from "../components/player/playerAudioState";
import { ScaleProvider } from "../tokens/ScaleContext";
import { AudioSettingsPanel } from "./AudioSettingsPanel";

/**
 * The audio settings panel (PLAYER-11, DEC-055).
 *
 * Three behaviours here are the step rather than decoration, and each has a
 * test that fails if it is undone: the exclusive toggle is disabled *with a
 * reason* where the platform has no such mode, a device that has been unplugged
 * stays selected rather than silently reverting, and what is actually playing is
 * shown whenever it differs from what was asked for.
 */

const DEVICES = [
  { name: "auto", description: "Autoselect device" },
  { name: "wasapi/{interface}", description: "Speakers (Focusrite USB Audio)" },
  { name: "wasapi/{hdmi}", description: "LC32G5xT (NVIDIA High Definition Audio)" },
];

function snapshot(audio: Partial<AudioState> = {}): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: null,
      playing: false,
      paused: false,
      positionSeconds: null,
      durationSeconds: null,
      volume: 100,
      muted: false,
    },
    queue: {
      length: 0,
      currentId: null,
      currentIndex: -1,
      currentItem: null,
      shuffle: false,
      repeat: "off",
    },
    audio: { ...EMPTY_AUDIO_STATE, exclusiveSupported: true, ...audio },
  };
}

function install(
  options: {
    audio?: Partial<AudioState>;
    devices?: Array<{ name: string; description: string }>;
    devicesResult?: { ok: boolean; devices: never[]; error?: string };
    setResult?: { ok: boolean; error?: string; code?: string };
  } = {},
) {
  const audioDevices = vi.fn().mockResolvedValue(
    options.devicesResult ?? { ok: true, devices: options.devices ?? DEVICES },
  );
  const setAudioSettings = vi.fn().mockResolvedValue(options.setResult ?? { ok: true });
  let push: ((state: PlayerSnapshot) => void) | null = null;
  window.cuepoint = {
    player: {
      getState: vi.fn().mockResolvedValue(snapshot(options.audio)),
      subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
        push = onState;
        onState(snapshot(options.audio));
        return vi.fn();
      }),
      audioDevices,
      setAudioSettings,
    },
  } as unknown as typeof window.cuepoint;
  return {
    audioDevices,
    setAudioSettings,
    push: (state: PlayerSnapshot) => push?.(state),
  };
}

function renderPanel() {
  return render(
    <ScaleProvider>
      <AudioSettingsPanel />
    </ScaleProvider>,
  );
}

const device = () => screen.getByRole("combobox", { name: /Output device/i });
const exclusive = () => screen.getByRole("checkbox", { name: /Exclusive output/i });

beforeEach(() => {
  localStorage.clear();
  resetPlayerStore();
});

afterEach(() => {
  resetPlayerStore();
  localStorage.clear();
  delete (window as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("the device picker", () => {
  it("lists what the machine has, by description", async () => {
    install();
    renderPanel();

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Speakers (Focusrite USB Audio)" })).toBeInTheDocument(),
    );
    // mpv's own "auto" is shown in the app's words, not mpv's, and only once.
    expect(screen.getByRole("option", { name: "System default" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Autoselect device" })).toBeNull();
  });

  it("asks the player fresh, rather than trusting a list from last time", async () => {
    // Interfaces are plugged in and unplugged while the app runs.
    const harness = install();
    renderPanel();

    await waitFor(() => expect(harness.audioDevices).toHaveBeenCalledTimes(1));
  });

  it("sends the choice to the player and remembers it", async () => {
    const harness = install();
    renderPanel();
    await waitFor(() => expect(harness.audioDevices).toHaveBeenCalled());

    await userEvent.selectOptions(device(), "wasapi/{interface}");

    await waitFor(() =>
      expect(harness.setAudioSettings).toHaveBeenCalledWith({ device: "wasapi/{interface}" }),
    );
    expect(localStorage.getItem(PLAYER_AUDIO_DEVICE_STORAGE_KEY)).toBe("wasapi/{interface}");
  });

  it("remembers nothing the player refused", async () => {
    // Otherwise the next launch restores a setting that never took effect.
    const harness = install({ setResult: { ok: false, error: "There is no audio player." } });
    renderPanel();
    await waitFor(() => expect(harness.audioDevices).toHaveBeenCalled());

    await userEvent.selectOptions(device(), "wasapi/{interface}");

    expect(await screen.findByText("There is no audio player.")).toBeInTheDocument();
    expect(localStorage.getItem(PLAYER_AUDIO_DEVICE_STORAGE_KEY)).toBeNull();
  });

  it("keeps a device that is no longer connected selected", async () => {
    // Losing the choice because the interface is asleep would make the user
    // pick it again every morning.
    install({ audio: { device: "wasapi/{gone}", activeDevice: "auto" } });
    renderPanel();

    await waitFor(() => expect(device()).toHaveValue("wasapi/{gone}"));
    expect(screen.getByRole("option", { name: /not connected/ })).toBeInTheDocument();
  });

  it("says so when it cannot read the devices at all", async () => {
    install({ devicesResult: { ok: false, devices: [], error: "There is no audio player." } });
    renderPanel();

    expect(await screen.findByText("There is no audio player.")).toBeInTheDocument();
  });

  it("survives the bridge throwing", async () => {
    install();
    (window.cuepoint!.player!.audioDevices as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("pipe closed"),
    );

    expect(() => renderPanel()).not.toThrow();
    expect(await screen.findByText("pipe closed")).toBeInTheDocument();
  });
});

describe("exclusive output", () => {
  it("explains what it costs before it is switched on", async () => {
    // Taking a device away from every other application on the machine is not
    // something to bury in a tooltip.
    install();
    renderPanel();

    expect(
      await screen.findByText(/other applications cannot use that device/i),
    ).toBeInTheDocument();
  });

  it("sends the toggle to the player", async () => {
    const harness = install();
    renderPanel();
    await waitFor(() => expect(harness.audioDevices).toHaveBeenCalled());

    await userEvent.click(exclusive());

    await waitFor(() =>
      expect(harness.setAudioSettings).toHaveBeenCalledWith({ exclusive: true }),
    );
  });

  it("is disabled with a reason where the platform has no such mode", async () => {
    // DEC-055: a control that lies is worse than one that explains itself.
    install({ audio: { exclusiveSupported: false } });
    renderPanel();

    await waitFor(() => expect(exclusive()).toBeDisabled());
    expect(
      screen.getByText(/Exclusive output is a Windows and macOS feature/i),
    ).toBeInTheDocument();
  });
});

describe("when the player falls back", () => {
  it("says the audio is shared while the toggle reads on", async () => {
    // The toggle still shows the user's choice, because the choice is kept —
    // so without this line it would be claiming something untrue.
    install({ audio: { exclusive: true, activeExclusive: false } });
    renderPanel();

    expect(
      await screen.findByText(/exclusive output was not available/i),
    ).toBeInTheDocument();
    expect(exclusive()).toBeChecked();
  });

  it("says the audio is on the system default when the device went away", async () => {
    install({ audio: { device: "wasapi/{gone}", activeDevice: "auto" } });
    renderPanel();

    expect(
      await screen.findByText(/the selected device was not available/i),
    ).toBeInTheDocument();
  });

  it("says nothing when what is playing is what was asked for", async () => {
    install({ audio: { device: "wasapi/{interface}", activeDevice: "wasapi/{interface}" } });
    renderPanel();

    await waitFor(() => expect(device()).toHaveValue("wasapi/{interface}"));
    expect(screen.queryByText(/was not available/i)).toBeNull();
  });

  it("notices a fallback that happens while the panel is open", async () => {
    const harness = install({ audio: { exclusive: true, activeExclusive: true } });
    renderPanel();
    await waitFor(() => expect(exclusive()).toBeChecked());

    harness.push(snapshot({ exclusive: true, activeExclusive: false }));

    expect(
      await screen.findByText(/exclusive output was not available/i),
    ).toBeInTheDocument();
  });
});

describe("without a player", () => {
  it("shows the controls disabled and says why", async () => {
    renderPanel();

    await waitFor(() => expect(device()).toBeDisabled());
    expect(exclusive()).toBeDisabled();
    expect(screen.getByText(/Open CuePoint as a desktop app/i)).toBeInTheDocument();
  });
});
