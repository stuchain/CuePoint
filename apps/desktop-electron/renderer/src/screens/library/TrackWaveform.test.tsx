import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  LibraryTrackDetail,
  LibraryTrackRow,
  PlayerSnapshot,
  QueueItem,
  TrackCue,
  WaveformTrack,
  WaveformTrackState,
} from "../../api/cuepointBridge.types";
import { EMPTY_AUDIO_STATE } from "../../components/player/playerFormat";
import { resetPlayerStore } from "../../components/player/playerStore";
import {
  DECODER_MISSING_WORDS,
  INSPECTOR_PICTURE_TITLE,
  INSPECTOR_SEEK_TITLE,
  WAVEFORM_LOADING_WORDS,
} from "../../components/waveform/analysisWords";
import { forgetWaveforms } from "../../components/waveform/waveformCache";
import { TrackDetailPanel } from "./TrackDetailPanel";
import { TrackWaveform } from "./TrackWaveform";

/**
 * The Inspector's waveform (WAVE-06): the selected track with its cues, loops
 * and grid, a pointer seek only while that track plays, its states in words,
 * and the track put first in the analysis while it waits.
 */

/** The box: 300 CSS pixels wide, 150 columns at the default scale of 2. */
const WIDTH = 300;

const HOT_CUE: TrackCue = {
  kind: "cue",
  hot_cue: 0,
  start_ms: 2_000,
  end_ms: null,
  name: "Drop",
  color: "#ff0000",
};

function waveform(
  trackId: number,
  state: WaveformTrackState = "ready",
  overrides: Partial<WaveformTrack> = {},
): WaveformTrack {
  return {
    track_id: trackId,
    state,
    reason: null,
    duration_ms: state === "ready" ? 6_000 : null,
    data: state === "ready" ? new Uint8Array(160 * 4).fill(160) : null,
    marks: { read: true, cues: [HOT_CUE], grid: [] },
    ...overrides,
  };
}

function item(trackId: number | null): QueueItem {
  return {
    id: "q1",
    trackId,
    filePath: "/music/bands.flac",
    title: "Bands",
    artist: "Fixture",
    key: null,
    bpm: null,
    durationSeconds: 6,
    status: "playing",
  } as QueueItem;
}

function snapshot(current: QueueItem | null, durationSeconds: number | null = 6): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: current?.filePath ?? null,
      playing: current !== null,
      paused: false,
      positionSeconds: current ? 3 : null,
      durationSeconds: current ? durationSeconds : null,
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
  };
}

interface Fill {
  colour: string;
  rect: number[];
}

let fills: Fill[];

function install({
  current = null as QueueItem | null,
  durationSeconds = 6 as number | null,
  answer = (id: number) => waveform(id),
  paused = false,
} = {}) {
  const player = {
    getState: vi.fn().mockResolvedValue(snapshot(current, durationSeconds)),
    subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
      onState(snapshot(current, durationSeconds));
      return vi.fn();
    }),
    seek: vi.fn().mockResolvedValue(undefined),
    playQueue: vi.fn().mockResolvedValue(undefined),
    toggle: vi.fn().mockResolvedValue(undefined),
  };
  const waveforms = {
    get: vi.fn(async ({ track_ids, width }: { track_ids: number[]; width: number; marks?: boolean }) => ({
      value: { width, paused, waveforms: track_ids.map(answer), unknown: [] },
      refusal: null,
    })),
    request: vi.fn().mockResolvedValue({ value: { requested: [], job_id: "job" }, refusal: null }),
    analysis: vi.fn().mockResolvedValue({ value: null, refusal: { code: "x", message: "x" } }),
  };
  window.cuepoint = { player, waveforms } as unknown as typeof window.cuepoint;
  return { player, waveforms };
}

const box = () => screen.getByTestId("inspector-waveform");

/** The picture is on the canvas, painted at its measured size. */
async function drawn() {
  await waitFor(() => expect(box().querySelector("canvas")).not.toBeNull());
  await waitFor(() => expect(fills.length).toBeGreaterThan(0));
}

beforeEach(() => {
  resetPlayerStore();
  forgetWaveforms();
  fills = [];
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: WIDTH,
    height: 66,
    left: 100,
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
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  resetPlayerStore();
  forgetWaveforms();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

describe("the Inspector's waveform", () => {
  it("draws the track with its marks, asked for at the box's columns", async () => {
    const { waveforms } = install();
    render(<TrackWaveform trackId={7} />);
    await drawn();

    expect(waveforms.get).toHaveBeenCalledWith({ track_ids: [7], width: 160, marks: true });
    // The hot cue at 2 s of 6, in its own colour: column 50 of 150.
    const unit = 2 * (window.devicePixelRatio || 1);
    const cue = fills.find((fill) => fill.colour === "#ff0000")!;
    expect(cue.rect[0]).toBe(50 * unit);
  });

  it("is a picture for a track that is not playing: no playhead, its title says so, and a click does nothing", async () => {
    const { player } = install({ current: item(99) });
    render(<TrackWaveform trackId={7} />);
    await drawn();

    expect(box()).toHaveAttribute("title", INSPECTOR_PICTURE_TITLE);
    expect(fills.some((fill) => fill.colour === "#fafafa")).toBe(false);
    fireEvent.click(box(), { clientX: 250 });

    expect(player.seek).not.toHaveBeenCalled();
    expect(player.playQueue).not.toHaveBeenCalled();
    expect(player.toggle).not.toHaveBeenCalled();
  });

  it("draws the playhead for the playing track, and a click seeks to the time under the pointer", async () => {
    const { player } = install({ current: item(7) });
    render(<TrackWaveform trackId={7} />);
    await drawn();

    expect(box()).toHaveAttribute("title", INSPECTOR_SEEK_TITLE);
    expect(box()).toHaveAttribute("data-playing", "true");
    // Three seconds of six: the playhead in column 75.
    const unit = 2 * (window.devicePixelRatio || 1);
    expect(fills.at(-1)).toEqual({ colour: "#fafafa", rect: [75 * unit, expect.any(Number), unit, expect.any(Number)] });

    // The box starts 100 CSS pixels in: a click 100 pixels into 300 is a third.
    fireEvent.click(box(), { clientX: 200 });

    expect(player.seek).toHaveBeenCalledTimes(1);
    expect(player.seek).toHaveBeenCalledWith(2);
  });

  it("lays the playing track across the player's duration", async () => {
    // The waveform says 6 s, the player 12 s: the hot cue at 2 s is a sixth in.
    install({ current: item(7), durationSeconds: 12 });
    render(<TrackWaveform trackId={7} />);
    await drawn();

    const unit = 2 * (window.devicePixelRatio || 1);
    expect(fills.find((fill) => fill.colour === "#ff0000")!.rect[0]).toBe(25 * unit);
  });

  it("is a picture while the player does not know the duration", async () => {
    const { player } = install({ current: item(7), durationSeconds: null });
    render(<TrackWaveform trackId={7} />);
    await drawn();

    expect(box()).toHaveAttribute("title", INSPECTOR_PICTURE_TITLE);
    fireEvent.click(box(), { clientX: 200 });
    expect(player.seek).not.toHaveBeenCalled();
  });

  it("says it is reading the waveform while it is read", async () => {
    const { waveforms } = install();
    waveforms.get.mockReturnValue(new Promise(() => undefined));
    render(<TrackWaveform trackId={7} />);

    expect(await within(box()).findByText(WAVEFORM_LOADING_WORDS)).toBeInTheDocument();
  });

  it.each<[string, WaveformTrackState, string | null, boolean, string]>([
    ["waiting", "waiting", null, false, "Waiting for analysis"],
    ["paused", "waiting", null, true, "Analysis paused"],
    ["undecodable", "failed", "undecodable", false, "This file could not be read (undecodable)"],
    ["missing", "missing", "not_found", false, "File missing"],
    ["unchecked", "unchecked", null, false, "Not checked yet"],
    ["without a decoder", "unavailable", "decoder_missing", false, DECODER_MISSING_WORDS],
  ])("says, in words, a track %s", async (_name, state, reason, paused, words) => {
    install({ answer: (id) => waveform(id, state, { reason }), paused });
    render(<TrackWaveform trackId={7} />);

    expect(await within(box()).findByText(words)).toBeInTheDocument();
    expect(box()).toHaveAttribute("title", words);
    expect(box().querySelector("canvas")).toBeNull();
  });

  it("says a waveform that could not be read", async () => {
    const { waveforms } = install();
    waveforms.get.mockRejectedValue(new Error("engine unreachable"));
    render(<TrackWaveform trackId={7} />);

    expect(
      await within(box()).findByText("Its waveform could not be read: engine unreachable"),
    ).toBeInTheDocument();
  });

  it("puts a track it shows first in the analysis while it waits", async () => {
    const { waveforms } = install({ answer: (id) => waveform(id, "waiting") });
    render(<TrackWaveform trackId={7} />);

    await waitFor(() => expect(waveforms.request).toHaveBeenCalledWith({ track_ids: [7] }));
    expect(waveforms.request).toHaveBeenCalledTimes(1);
  });

  it("asks nothing of the analysis for a track that has its waveform", async () => {
    const { waveforms } = install();
    render(<TrackWaveform trackId={7} />);
    await drawn();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    expect(waveforms.request).not.toHaveBeenCalled();
  });
});

describe("in the Inspector", () => {
  const TRACK = {
    id: 7,
    rekordbox_track_id: "7",
    title: "Bands",
    artist: "Fixture",
    file_path: "/music/bands.flac",
  } as LibraryTrackRow;
  const DETAIL = {
    track: TRACK,
    playlists: [],
    playlist_count: 0,
    metadata: {
      track_id: 7,
      rating: null,
      rekordbox_rating: null,
      effective_rating: null,
      rating_source: null,
      favorite: false,
      notes: null,
      created_at: null,
      updated_at: null,
    },
    tags: [],
    collections: [],
  } as unknown as LibraryTrackDetail;

  it("sits under the header, before everything else", async () => {
    install();
    const { container } = render(<TrackDetailPanel detail={DETAIL} />);
    const section = await screen.findByRole("region", { name: "Waveform" });
    const header = container.querySelector(".cp-track-detail__head")!;

    expect(header.nextElementSibling).toBe(section);
  });

  it("is absent where there are no waveforms to show", () => {
    install();
    delete (window.cuepoint as { waveforms?: unknown }).waveforms;
    render(<TrackDetailPanel detail={DETAIL} />);

    expect(screen.queryByRole("region", { name: "Waveform" })).toBeNull();
  });

  it("shows the new track's state, never the last one's picture, when the selection changes", async () => {
    // Regression: keyed by the bare track id beside TrackYours, which is too,
    // the old waveform stayed beside the new one.
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    install({ answer: (id) => (id === 7 ? waveform(id) : waveform(id, "waiting")) });
    const { rerender } = render(<TrackDetailPanel detail={DETAIL} />);
    await drawn();

    rerender(<TrackDetailPanel detail={{ ...DETAIL, track: { ...TRACK, id: 8 } }} />);

    expect(screen.getAllByTestId("inspector-waveform")).toHaveLength(1);
    expect(box().querySelector("canvas")).toBeNull();
    expect(await within(box()).findByText("Waiting for analysis")).toBeInTheDocument();
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
  });
});
