import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PlayerSnapshot,
  QueueItem,
  WaveformAnalysisStatus,
  WaveformTrack,
} from "../api/cuepointBridge.types";
import { ToastProvider } from "../components";
import { EMPTY_AUDIO_STATE } from "../components/player/playerFormat";
import { resetPlayerStore } from "../components/player/playerStore";
import { DECODER_MISSING_WORDS, PREVIEW_EMPTY_WORDS } from "../components/waveform/analysisWords";
import { forgetWaveforms } from "../components/waveform/waveformCache";
import {
  WAVEFORM_COLOUR_STORAGE_KEY,
  resetWaveformColourForTests,
} from "../components/waveform/waveformColour";
import { ScaleProvider } from "../tokens/ScaleContext";
import { WaveformSettingsPanel } from "./WaveformSettingsPanel";

/**
 * Settings → Waveforms (WAVE-05): the analysis's state in words and its one
 * button, the colour choice remembered across a reload and through storage
 * that throws, a preview on the track in the player, and "Delete waveform
 * data…", which says what it costs before it does it.
 */

function status(overrides: Partial<WaveformAnalysisStatus> = {}): WaveformAnalysisStatus {
  const merged: WaveformAnalysisStatus = {
    state: "idle",
    paused: false,
    job_id: null,
    present: 50_000,
    analysed: 50_000,
    failed: 0,
    remaining: 0,
    rate_per_hour: null,
    eta_seconds: null,
    reason: null,
    store_bytes: 252_000_000,
    ...overrides,
  };
  return { ...merged, remaining: merged.present - merged.analysed - merged.failed };
}

const ok = <T,>(value: T) => ({ value, refusal: null });

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    trackId: 7,
    filePath: "/music/bands.flac",
    title: "Bands",
    artist: "Fixture",
    key: null,
    bpm: null,
    durationSeconds: 20,
    status: "ready",
    ...overrides,
  } as QueueItem;
}

function snapshot(current: QueueItem | null): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: current?.filePath ?? null,
      playing: current !== null,
      paused: false,
      positionSeconds: current ? 5 : null,
      durationSeconds: current ? 20 : null,
      volume: 100,
      muted: false,
    },
    queue: {
      length: current ? 1 : 0,
      currentId: current?.id ?? null,
      currentIndex: current ? 0 : -1,
      currentItem: current,
      shuffle: false,
      repeat: "off",
    },
    audio: EMPTY_AUDIO_STATE,
  } as PlayerSnapshot;
}

function track(overrides: Partial<WaveformTrack> = {}): WaveformTrack {
  return {
    track_id: 7,
    state: "ready",
    reason: null,
    duration_ms: 20_000,
    loudness: null,
    data: new Uint8Array(480).fill(180),
    marks: { read: true, cues: [], grid: [] },
    ...overrides,
  };
}

function install({
  analysis = status(),
  current = null as QueueItem | null,
  waveform = track(),
  paused = false,
} = {}) {
  const waveforms = {
    analysis: vi.fn().mockResolvedValue(ok(analysis)),
    pause: vi.fn().mockResolvedValue(ok(status({ state: "paused", paused: true, analysed: 1_234 }))),
    resume: vi.fn().mockResolvedValue(ok(status({ state: "running", analysed: 1_234 }))),
    get: vi.fn().mockResolvedValue(ok({ width: 120, paused, waveforms: [waveform], unknown: [] })),
    request: vi.fn(),
    deleteData: vi.fn().mockResolvedValue(
      ok({
        deleted: { waveforms: 50_000, freed_bytes: 251_000_000 },
        analysis: status({ state: "running", analysed: 0 }),
      }),
    ),
  };
  window.cuepoint = {
    waveforms,
    player: {
      getState: vi.fn().mockResolvedValue(snapshot(current)),
      subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
        onState(snapshot(current));
        return vi.fn();
      }),
    },
  } as unknown as typeof window.cuepoint;
  return waveforms;
}

function renderPanel() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ScaleProvider>
          <WaveformSettingsPanel />
        </ScaleProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const state = () => screen.getByTestId("waveform-analysis-state");

/** "Disk space" is a closed disclosure; Delete waveform data… is inside it. */
async function openDiskSpace(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("Disk space"));
}

beforeEach(() => {
  localStorage.clear();
  resetWaveformColourForTests();
  resetPlayerStore();
  forgetWaveforms();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  resetPlayerStore();
  forgetWaveforms();
  localStorage.clear();
  resetWaveformColourForTests();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("the page's words (SET-6)", () => {
  it("says what the waveforms are for, before anything else", async () => {
    install();
    renderPanel();
    expect(
      screen.getByText("Waveforms are drawn from your audio files, in the background, a few at a time."),
    ).toBeInTheDocument();
  });

  it("orders status, colors and preview, then a collapsed Disk space", async () => {
    install();
    const { container } = renderPanel();
    await waitFor(() => expect(state()).toHaveTextContent("All 50,000 analyzed"));
    const html = container.innerHTML;
    const at = (needle: string) => html.indexOf(needle);
    expect(at("waveform-analysis-state")).toBeLessThan(at("Colors"));
    expect(at("Colors")).toBeLessThan(at("waveform-preview"));
    expect(at("waveform-preview")).toBeLessThan(at("Disk space"));
    const disk = container.querySelector("details")!;
    expect(disk).not.toHaveAttribute("open");
    expect(disk.querySelector("summary")).toHaveTextContent("Disk space");
    expect(disk).toHaveTextContent("Waveforms take 240.3 MB.");
    expect(disk).toContainElement(screen.getByRole("button", { name: "Delete waveform data…" }));
  });

  it("says there is nothing to analyze yet, and links to the Clean page", async () => {
    install({ analysis: status({ present: 0, analysed: 0 }) });
    renderPanel();
    await waitFor(() =>
      expect(state()).toHaveTextContent(
        "Nothing to analyze yet: CuePoint analyzes tracks once their files have been found. Check files on the Clean page.",
      ),
    );
    expect(within(state()).getByRole("link", { name: "Check files on the Clean page." })).toHaveAttribute(
      "href",
      "/clean",
    );
    expect(screen.queryByText(/No checked files/)).toBeNull();
  });

  it("uses American spelling for the colors", () => {
    install();
    renderPanel();
    expect(screen.getByText("Colors")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "One color" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/[Cc]olour/);
  });

  it("shows Saved after the color is chosen", async () => {
    install();
    renderPanel();
    await userEvent.click(screen.getByRole("radio", { name: "One color" }));
    expect(document.body).toHaveTextContent("✓ Saved");
  });
});

describe("the analysis's state", () => {
  it.each([
    [
      status({ state: "running", analysed: 1_234, eta_seconds: 6 * 3600 }),
      "Analyzing · 1,234 of 50,000 · about 6 hours left",
      "Pause",
    ],
    [status({ state: "paused", paused: true, analysed: 1_234 }), "Paused · 48,766 to go", "Resume"],
    [status({ analysed: 49_997, failed: 3 }), "All 50,000 analyzed · 3 could not be read", "Analyze waveforms"],
  ])("says %#: %s", async (analysis, words, button) => {
    install({ analysis });
    renderPanel();

    await waitFor(() => expect(state()).toHaveTextContent(words));
    expect(screen.getByRole("button", { name: button })).toBeInTheDocument();
  });

  it("says once, in words, that a build without the decoder has no waveforms", async () => {
    install({ analysis: status({ state: "unavailable", reason: "decoder_missing" }) });
    renderPanel();

    await waitFor(() => expect(state()).toHaveTextContent(DECODER_MISSING_WORDS));
    expect(screen.queryByRole("button", { name: /Pause|Resume|Analyze/ })).toBeNull();
  });

  it("pauses and resumes, showing the state each answers", async () => {
    const user = userEvent.setup();
    const bridge = install({ analysis: status({ state: "running", analysed: 1_234 }) });
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Pause" }));
    expect(bridge.pause).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(state()).toHaveTextContent("Paused · 48,766 to go"));

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(bridge.resume).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(state()).toHaveTextContent("Analyzing · 1,234 of 50,000"));
  });

  it("says a pause that could not be saved", async () => {
    const user = userEvent.setup();
    const bridge = install({ analysis: status({ state: "running", analysed: 1 }) });
    bridge.pause.mockResolvedValue({
      value: null,
      refusal: { code: "WAVEFORMS_SETTING_FAILED", message: "The waveform setting could not be saved" },
    });
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Pause" }));

    expect(await screen.findByText("The waveform setting could not be saved")).toBeInTheDocument();
  });

  it("offers nothing to manage outside the desktop app", () => {
    window.cuepoint = {} as typeof window.cuepoint;
    renderPanel();

    expect(screen.getByText("Open CuePoint as a desktop app to analyze waveforms.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete waveform data/ })).toBeNull();
  });
});

describe("the color choice", () => {
  const bands = () => screen.getByRole("radio", { name: "Three bands" });
  const single = () => screen.getByRole("radio", { name: "One color" });

  it("is three bands until chosen otherwise", () => {
    install();
    renderPanel();
    expect(bands()).toBeChecked();
    expect(single()).not.toBeChecked();
  });

  it("is remembered across a reload", async () => {
    const user = userEvent.setup();
    install();
    const { unmount } = renderPanel();
    await user.click(single());
    expect(localStorage.getItem(WAVEFORM_COLOUR_STORAGE_KEY)).toBe("single");
    unmount();

    resetWaveformColourForTests();
    renderPanel();

    expect(single()).toBeChecked();
  });

  it("works with storage that throws, and reads it as three bands", async () => {
    const user = userEvent.setup();
    // Storage refuses this key only: the test is about this preference.
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === WAVEFORM_COLOUR_STORAGE_KEY) throw new Error("denied");
      return getItem.call(this, key);
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === WAVEFORM_COLOUR_STORAGE_KEY) throw new Error("denied");
      setItem.call(this, key, value);
    });
    install();
    renderPanel();
    expect(bands()).toBeChecked();

    await user.click(single());

    expect(single()).toBeChecked();
  });
});

describe("the preview", () => {
  // jsdom lays nothing out; the preview asks for a picture only once its box
  // has a width (WAVE-06), so each test gives it one.
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 320,
      height: 66,
    } as DOMRect);
  });

  it("asks for nothing until its box has a width", async () => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({
      width: 0,
      height: 0,
    } as DOMRect);
    const bridge = install({ current: item() });
    renderPanel();

    expect(await screen.findByText("Reading its waveform…")).toBeInTheDocument();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(bridge.get).not.toHaveBeenCalled();
  });

  it("asks at its box's columns, rounded up to a multiple of 16", async () => {
    const bridge = install({ current: item() });
    renderPanel();

    // 320 CSS pixels at the default scale of 2: 160 columns.
    await waitFor(() => expect(bridge.get).toHaveBeenCalled());
    expect(bridge.get).toHaveBeenCalledWith(expect.objectContaining({ width: 160 * (window.devicePixelRatio || 1) }));
  });

  it("asks for a track to be played when nothing is in the player", async () => {
    install();
    renderPanel();
    expect(await screen.findByText(PREVIEW_EMPTY_WORDS)).toBeInTheDocument();
  });

  it("draws the track in the player, with its cues and grid", async () => {
    const bridge = install({ current: item() });
    renderPanel();

    await waitFor(() =>
      expect(screen.getByTestId("waveform-preview").querySelector("canvas")).not.toBeNull(),
    );
    expect(screen.getByText(/Fixture – Bands/)).toBeInTheDocument();
    expect(bridge.get).toHaveBeenCalledWith(expect.objectContaining({ track_ids: [7], marks: true }));
  });

  it("says why a track has no waveform yet", async () => {
    install({ current: item(), waveform: track({ state: "waiting", data: null, duration_ms: null }), paused: true });
    renderPanel();

    expect(await within(screen.getByTestId("waveform-preview")).findByText("Analysis paused")).toBeInTheDocument();
  });

  it("says when the track in the player is not in the library", async () => {
    install({ current: item({ trackId: null }) });
    renderPanel();

    expect(await screen.findByText("The track in the player is not in the library.")).toBeInTheDocument();
  });
});

describe("Delete waveform data…", () => {
  it("asks first, stating the size on disk and that the library is analyzed again", async () => {
    const user = userEvent.setup();
    const bridge = install({ analysis: status({ state: "running", analysed: 1_000, rate_per_hour: 8_000 }) });
    renderPanel();
    await waitFor(() => expect(state()).toHaveTextContent("Analyzing"));

    await openDiskSpace(user);
    await user.click(screen.getByRole("button", { name: "Delete waveform data…" }));

    const dialog = screen.getByRole("dialog", { name: "Delete waveform data?" });
    expect(dialog).toHaveTextContent("240.3 MB on disk");
    expect(dialog).toHaveTextContent(
      "The whole library will be analyzed again, which takes about 6 hours at the current rate.",
    );
    expect(bridge.deleteData).not.toHaveBeenCalled();
  });

  it("deletes nothing when cancelled", async () => {
    const user = userEvent.setup();
    const bridge = install();
    renderPanel();
    await waitFor(() => expect(state()).toHaveTextContent("All 50,000 analyzed"));

    await openDiskSpace(user);
    await user.click(screen.getByRole("button", { name: "Delete waveform data…" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(bridge.deleteData).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("deletes when confirmed, and says what it freed", async () => {
    const user = userEvent.setup();
    const bridge = install();
    renderPanel();
    await waitFor(() => expect(state()).toHaveTextContent("All 50,000 analyzed"));

    await openDiskSpace(user);
    await user.click(screen.getByRole("button", { name: "Delete waveform data…" }));
    await user.click(screen.getByRole("button", { name: "Delete waveform data" }));

    expect(bridge.deleteData).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Deleted 50,000 waveforms, freeing 239.4 MB.")).toBeInTheDocument();
    await waitFor(() => expect(state()).toHaveTextContent("Analyzing · 0 of 50,000"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says when the data could not be deleted", async () => {
    const user = userEvent.setup();
    const bridge = install();
    bridge.deleteData.mockResolvedValue({
      value: null,
      refusal: { code: "WAVEFORMS_STORE_FAILED", message: "The waveform data could not be deleted" },
    });
    renderPanel();
    await waitFor(() => expect(state()).toHaveTextContent("All 50,000 analyzed"));

    await openDiskSpace(user);
    await user.click(screen.getByRole("button", { name: "Delete waveform data…" }));
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Delete waveform data" }));
    });

    expect(await screen.findByText("The waveform data could not be deleted")).toBeInTheDocument();
  });
});
