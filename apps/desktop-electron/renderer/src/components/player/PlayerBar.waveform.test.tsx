import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PlayerSnapshot,
  QueueItem,
  WaveformTrack,
  WaveformTrackState,
} from "../../api/cuepointBridge.types";
import { DECODER_MISSING_WORDS } from "../waveform/analysisWords";
import { forgetWaveforms } from "../waveform/waveformCache";
import { PlayerBar } from "./PlayerBar";
import { EMPTY_AUDIO_STATE } from "./playerFormat";
import { resetPlayerStore } from "./playerStore";

/**
 * The bar's seek control with the waveform as its picture (WAVE-06, DEC-114).
 *
 * PLAYER-06's own tests run unchanged in `PlayerBar.test.tsx`, where no
 * waveform is ever drawn. These hold what drawing one must not change, the
 * range input's role, label, value text and steps and one seek per drag, and
 * what it adds: the picture laid across the player's duration, the slider
 * exactly as before for every state without a picture, and the playing track
 * put first in the analysis while it waits.
 */

/** The seek region's box: 600 CSS pixels, 300 columns at the default scale of 2. */
const WIDTH = 600;
const HEIGHT = 40;

function item(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    trackId: 1,
    filePath: "/music/strobe.flac",
    title: "Strobe",
    artist: "deadmau5",
    key: "8A",
    bpm: 128,
    durationSeconds: 600,
    status: "playing",
    ...overrides,
  };
}

function snapshot(
  current: QueueItem | null = item(),
  playback: Partial<PlayerSnapshot["playback"]> = {},
): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: current?.filePath ?? null,
      playing: true,
      paused: false,
      positionSeconds: 30,
      durationSeconds: 600,
      volume: 80,
      muted: false,
      ...playback,
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
  };
}

function waveform(
  trackId: number,
  state: WaveformTrackState = "ready",
  overrides: Partial<WaveformTrack> = {},
): WaveformTrack {
  return {
    track_id: trackId,
    state,
    reason: null,
    duration_ms: state === "ready" ? 600_000 : null,
    loudness: state === "ready" ? { integrated_lufs: -8.4, peak_dbfs: -0.3, reason: null } : null,
    data: state === "ready" ? new Uint8Array(304 * 4).fill(160) : null,
    marks: null,
    ...overrides,
  };
}

interface Fills {
  colour: string;
  rect: number[];
}

let fills: Fills[];

function install(
  initial: PlayerSnapshot,
  answer: (trackId: number) => WaveformTrack = (id) => waveform(id),
  { paused = false } = {},
) {
  let push: ((state: PlayerSnapshot) => void) | null = null;
  const player = {
    getState: vi.fn().mockResolvedValue(initial),
    subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
      push = onState;
      onState(initial);
      return vi.fn();
    }),
    seek: vi.fn().mockResolvedValue(undefined),
  };
  const waveforms = {
    get: vi.fn(async ({ track_ids, width }: { track_ids: number[]; width: number }) => ({
      value: { width, paused, waveforms: track_ids.map(answer), unknown: [] },
      refusal: null,
    })),
    request: vi.fn().mockResolvedValue({ value: { requested: [], job_id: "job" }, refusal: null }),
    analysis: vi.fn().mockResolvedValue({ value: null, refusal: { code: "x", message: "x" } }),
  };
  window.cuepoint = { player, waveforms } as unknown as typeof window.cuepoint;
  return { player, waveforms, push: (state: PlayerSnapshot) => act(() => push?.(state)) };
}

const slider = () => screen.getByRole("slider", { name: "Seek" });
const holder = () => screen.getByTestId("player-waveform");
const region = () => holder().parentElement!;

beforeEach(() => {
  resetPlayerStore();
  forgetWaveforms();
  fills = [];
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: WIDTH,
    height: HEIGHT,
    left: 0,
    top: 0,
  } as DOMRect);
  const context = {
    fillStyle: "",
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect: () => {
      fills = [];
    },
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ colour: String(this.fillStyle), rect: [x, y, w, h] });
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) => (name === "--fg-primary" ? "#fafafa" : "#123456"),
      }) as CSSStyleDeclaration,
  );
});

afterEach(async () => {
  // Unmounted first: the shared cache asks again for whatever is still shown
  // when it is emptied, and would ask the next test's bridge.
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  resetPlayerStore();
  forgetWaveforms();
  localStorage.clear();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

/** The picture is on the canvas, painted at its measured size. */
async function drawn() {
  await waitFor(() => expect(holder().querySelector("canvas")).not.toBeNull());
  await waitFor(() => expect(fills.length).toBeGreaterThan(0));
}

describe("the waveform as the seek control's picture", () => {
  it("draws the playing track's waveform under the slider, which keeps its role, label, value text and steps", async () => {
    install(snapshot());
    render(<PlayerBar />);
    await drawn();

    const input = slider();
    expect(input).toHaveAttribute("type", "range");
    expect(input).toHaveAttribute("min", "0");
    expect(input).toHaveAttribute("max", "600");
    expect(input).toHaveAttribute("step", "0.5");
    expect(input).toHaveAttribute("aria-valuetext", "0:30 of 10:00");
    expect(input).toBeEnabled();
    // The input lies over the picture, in the same holder; the picture says
    // nothing to assistive technology, the input says it all.
    expect(holder()).toHaveClass("cp-player-bar__wave--drawn");
    expect(holder()).toContainElement(input);
    expect(holder().querySelector("canvas")).toHaveAttribute("aria-hidden", "true");
    expect(region()).not.toHaveAttribute("title");
  });

  it("asks for the picture at the seek region's columns, without marks", async () => {
    const { waveforms } = install(snapshot());
    render(<PlayerBar />);
    await drawn();

    // 600 CSS pixels at scale 2 are 300 columns; asked for rounded up to 304.
    expect(waveforms.get).toHaveBeenCalledWith({ track_ids: [1], width: 304, marks: false });
  });

  it("previews a drag over the picture, and seeks once on release", async () => {
    const { player } = install(snapshot());
    render(<PlayerBar />);
    await drawn();

    fireEvent.change(slider(), { target: { value: "100" } });
    fireEvent.change(slider(), { target: { value: "125" } });
    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(player.seek).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider());

    expect(player.seek).toHaveBeenCalledTimes(1);
    expect(player.seek).toHaveBeenCalledWith(125);
  });

  it("seeks from the keyboard as before", async () => {
    const { player } = install(snapshot());
    render(<PlayerBar />);
    await drawn();

    fireEvent.change(slider(), { target: { value: "60" } });
    fireEvent.keyUp(slider(), { key: "ArrowRight" });

    expect(player.seek).toHaveBeenCalledTimes(1);
    expect(player.seek).toHaveBeenCalledWith(60);
  });

  it("lays the picture across the player's duration, the playhead where main says", async () => {
    // The waveform says 590 s and the player 600 s: the playhead at 300 s is
    // in the middle of the bar, as the slider's handle would be.
    install(snapshot(item(), { positionSeconds: 300 }), (id) => waveform(id, "ready", { duration_ms: 590_000 }));
    render(<PlayerBar />);
    await drawn();

    const playhead = fills.at(-1)!;
    expect(playhead.colour).toBe("#fafafa");
    const unit = 2 * (window.devicePixelRatio || 1);
    expect(playhead.rect[0]).toBe(150 * unit);
  });

  it("moves the playhead with a drag's preview", async () => {
    install(snapshot(item(), { positionSeconds: 0 }));
    render(<PlayerBar />);
    await drawn();

    fireEvent.change(slider(), { target: { value: "450" } });

    const unit = 2 * (window.devicePixelRatio || 1);
    await waitFor(() => expect(fills.at(-1)!.rect[0]).toBe(225 * unit));
  });
});

describe("without a picture, the slider exactly as before", () => {
  it.each<[string, WaveformTrackState, string | null, boolean, string]>([
    ["waiting", "waiting", null, false, "Waveform not drawn yet"],
    ["waiting while paused", "waiting", null, true, "Analysis paused"],
    ["failed", "failed", "undecodable", false, "This file's audio could not be read."],
    ["missing", "missing", "not_found", false, "File missing"],
    ["unchecked", "unchecked", null, false, "Not checked yet"],
    ["without a decoder", "unavailable", "decoder_missing", false, DECODER_MISSING_WORDS],
  ])("%s: no picture, and the region's title says why", async (_name, state, reason, paused, words) => {
    install(snapshot(), (id) => waveform(id, state, { reason }), { paused });
    render(<PlayerBar />);

    await waitFor(() => expect(region()).toHaveAttribute("title", words));
    expect(holder().querySelector("canvas")).toBeNull();
    expect(holder()).not.toHaveClass("cp-player-bar__wave--drawn");
    expect(slider()).toBeEnabled();
    // Never in the region's space: the bar shows no box of words.
    expect(screen.queryByText(words)).toBeNull();
  });

  it("says a waveform that could not be read in the title", async () => {
    const { waveforms } = install(snapshot());
    waveforms.get.mockRejectedValue(new Error("engine unreachable"));
    render(<PlayerBar />);

    await waitFor(() =>
      expect(region()).toHaveAttribute("title", "Its waveform could not be read: engine unreachable"),
    );
    expect(holder().querySelector("canvas")).toBeNull();
  });

  it("shows the slider while the waveform is read, with no title yet", async () => {
    const { waveforms } = install(snapshot());
    waveforms.get.mockReturnValue(new Promise(() => undefined));
    render(<PlayerBar />);

    await waitFor(() => expect(waveforms.get).toHaveBeenCalled());
    expect(holder().querySelector("canvas")).toBeNull();
    expect(region()).not.toHaveAttribute("title");
  });

  it("shows the slider until the player knows the duration", async () => {
    install(snapshot(item(), { durationSeconds: null }));
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    expect(holder().querySelector("canvas")).toBeNull();
    expect(slider()).toBeDisabled();
  });

  it("asks for nothing for a file that is not in the library", async () => {
    const { waveforms } = install(snapshot(item({ trackId: null })));
    render(<PlayerBar />);
    await screen.findByText("Strobe");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    expect(waveforms.get).not.toHaveBeenCalled();
    expect(waveforms.request).not.toHaveBeenCalled();
    expect(region()).not.toHaveAttribute("title");
  });
});

describe("a track that starts playing", () => {
  it("is put first in the analysis while it waits, and each new track is", async () => {
    const { waveforms, push } = install(snapshot(), (id) => waveform(id, "waiting"));
    render(<PlayerBar />);

    await waitFor(() => expect(waveforms.request).toHaveBeenCalledWith({ track_ids: [1] }));

    push(snapshot(item({ id: "q2", trackId: 2, title: "Ghosts" })));

    await waitFor(() => expect(waveforms.request).toHaveBeenCalledWith({ track_ids: [2] }));
    expect(waveforms.request).toHaveBeenCalledTimes(2);
  });

  it("is asked for once while it plays, though its answer is read again", async () => {
    const { waveforms, push } = install(snapshot(), (id) => waveform(id, "waiting"));
    render(<PlayerBar />);
    await waitFor(() => expect(waveforms.request).toHaveBeenCalledTimes(1));

    push(snapshot(item(), { positionSeconds: 31 }));
    push(snapshot(item(), { positionSeconds: 32 }));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    expect(waveforms.request).toHaveBeenCalledTimes(1);
  });

  it("is not asked for when its waveform is ready, or cannot be made", async () => {
    const { waveforms, push } = install(snapshot());
    render(<PlayerBar />);
    await drawn();

    const states: WaveformTrackState[] = ["failed", "missing", "unchecked", "unavailable"];
    for (const [index, state] of states.entries()) {
      const trackId = 10 + index;
      waveforms.get.mockImplementation(async ({ track_ids, width }) => ({
        value: { width, paused: false, waveforms: track_ids.map((id) => waveform(id, state)), unknown: [] },
        refusal: null,
      }));
      push(snapshot(item({ id: `q${trackId}`, trackId })));
      await waitFor(() =>
        expect(waveforms.get).toHaveBeenCalledWith(expect.objectContaining({ track_ids: [trackId] })),
      );
    }
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    expect(waveforms.request).not.toHaveBeenCalled();
  });
});
