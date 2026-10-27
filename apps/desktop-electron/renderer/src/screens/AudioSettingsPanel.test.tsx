import { Activity } from "react";
import { fireEvent, render as baseRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioState, PlayerSnapshot } from "../api/cuepointBridge.types";
import { EMPTY_AUDIO_STATE } from "../components/player/playerFormat";
import { resetPlayerStore } from "../components/player/playerStore";
import { PLAYER_AUDIO_DEVICE_STORAGE_KEY } from "../components/player/playerAudioState";
import { ScaleProvider } from "../tokens/ScaleContext";
import { AudioSettingsPanel } from "./AudioSettingsPanel";
import type { ReactElement } from "react";
import { ToastProvider } from "../components";

/** The panels' Reset offers Undo in a toast, so they render inside the provider the app has. */
const render = (ui: ReactElement) => baseRender(ui, { wrapper: ToastProvider });

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

describe("the panel's words", () => {
  it("is titled Playback", async () => {
    install();
    renderPanel();
    expect(screen.getByRole("heading", { name: "Playback" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Audio" })).toBeNull();
  });

  it("counts outputs in one line, with the unplug detail said outright (M237)", async () => {
    install();
    renderPanel();
    expect(await screen.findByText("3 outputs found")).toBeInTheDocument();
    const detail = screen.getByText(
      "If the chosen one is unplugged, CuePoint switches to System default.",
    );
    expect(detail).toBeVisible();
    expect(screen.queryByRole("button", { name: "More about this" })).toBeNull();
  });

  it("shows the last device list at once on a revisit while it asks the player again", async () => {
    const harness = install();
    const first = renderPanel();
    expect(await screen.findByText("3 outputs found")).toBeInTheDocument();
    first.unmount();

    // The player is slow this time: the answer has not come back yet.
    harness.audioDevices.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByText("3 outputs found")).toBeInTheDocument();
    expect(screen.queryByText("Loading the output devices…")).toBeNull();
    expect(screen.getByRole("option", { name: "Speakers (Focusrite USB Audio)" })).toBeInTheDocument();
    await waitFor(() => expect(harness.audioDevices).toHaveBeenCalledTimes(2));
  });

  it("keeps the list shown while the page is hidden and shown again (React Activity)", async () => {
    const harness = install();
    const view = (mode: "visible" | "hidden") => (
      <ScaleProvider>
        <Activity mode={mode}>
          <AudioSettingsPanel />
        </Activity>
      </ScaleProvider>
    );
    const { rerender } = render(view("visible"));
    expect(await screen.findByText("3 outputs found")).toBeInTheDocument();

    rerender(view("hidden"));
    // The player is slow when the page is shown again: the second answer is still pending.
    harness.audioDevices.mockReturnValue(new Promise(() => {}));
    rerender(view("visible"));
    await waitFor(() => expect(harness.audioDevices).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Loading the output devices…")).toBeNull();
    expect(screen.getByText("3 outputs found")).toBeInTheDocument();
  });

  it("lets only the latest ask set the list, however late an older answer lands", async () => {
    const harness = install();
    let answerOlder!: (value: unknown) => void;
    harness.audioDevices.mockReturnValueOnce(new Promise((resolve) => (answerOlder = resolve)));
    const view = (mode: "visible" | "hidden") => (
      <ScaleProvider>
        <Activity mode={mode}>
          <AudioSettingsPanel />
        </Activity>
      </ScaleProvider>
    );
    const { rerender } = render(view("visible"));
    await waitFor(() => expect(harness.audioDevices).toHaveBeenCalledTimes(1));
    rerender(view("hidden"));
    harness.audioDevices.mockResolvedValue({ ok: true, devices: [DEVICES[0]!] });
    rerender(view("visible"));
    expect(await screen.findByText("1 output found")).toBeInTheDocument();

    // The first ask answers last, with the old three: it must not replace the newer one.
    answerOlder({ ok: true, devices: DEVICES });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByText("1 output found")).toBeInTheDocument();
  });

  it("says it is reading the devices the first time, with no list yet", async () => {
    const harness = install();
    harness.audioDevices.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(await screen.findByText("Loading the output devices…")).toBeInTheDocument();
  });

  it("keeps the singular right", async () => {
    install({ devices: [DEVICES[0]!] });
    renderPanel();
    expect(await screen.findByText("1 output found")).toBeInTheDocument();
  });

  it("says exclusive output in one line, with the detail under a fold named for it (M237)", async () => {
    install();
    renderPanel();
    expect(
      await screen.findByText(
        "Plays straight to your audio interface. Other apps cannot use it meanwhile.",
      ),
    ).toBeInTheDocument();
    const detail = screen.getByText(/Leave it off unless you use an audio interface/);
    expect(detail).not.toBeVisible();
    expect(document.querySelector("details")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Who needs exclusive output" });
    expect(toggle).toHaveAccessibleDescription(
      "Plays straight to your audio interface. Other apps cannot use it meanwhile.",
    );
    fireEvent.click(toggle);
    expect(detail).toBeVisible();
  });

  it("shows Saved after a change the player accepted, and not after one it refused", async () => {
    const harness = install();
    renderPanel();
    await waitFor(() => expect(harness.audioDevices).toHaveBeenCalled());
    await userEvent.click(exclusive());
    await waitFor(() => expect(document.body).toHaveTextContent("Saved"));
  });

  it("does not say Saved for a change the player refused", async () => {
    const harness = install({ setResult: { ok: false, error: "No." } });
    renderPanel();
    await waitFor(() => expect(harness.audioDevices).toHaveBeenCalled());
    await userEvent.click(exclusive());
    expect(await screen.findByText("No.")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Saved");
  });
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
      await screen.findByText(/Other apps cannot use it meanwhile/i),
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

  it("is not drawn at all where the platform has no such mode", async () => {
    // DEC-055 asked for a reason; the page now leaves the control out instead.
    install({ audio: { exclusiveSupported: false } });
    renderPanel();

    await screen.findByRole("combobox", { name: /Output device/i });
    expect(screen.queryByRole("checkbox", { name: /Exclusive output/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Not available on this system/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Windows and macOS feature/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Plays straight to your audio interface/)).not.toBeInTheDocument();
  });

  it("is drawn, with its hint, where the platform has it", async () => {
    install({ audio: { exclusiveSupported: true } });
    renderPanel();

    await waitFor(() => expect(exclusive()).toBeEnabled());
    expect(screen.getByText(/Plays straight to your audio interface/)).toBeInTheDocument();
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
    // Nothing says exclusive output is supported, so it is not drawn.
    expect(screen.queryByRole("checkbox", { name: /Exclusive output/i })).not.toBeInTheDocument();
    expect(screen.getByText(/needs the CuePoint desktop app/i)).toBeInTheDocument();
  });
});
