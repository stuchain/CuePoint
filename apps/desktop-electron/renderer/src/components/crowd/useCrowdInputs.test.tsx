import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerLevels, PlayerSnapshot, QueueItem } from "../../api/cuepointBridge.types";
import { EMPTY_AUDIO_STATE } from "../player/playerFormat";
import { resetPlayerStore } from "../player/playerStore";
import { forgetWaveforms } from "../waveform/waveformCache";
import { useCrowdInputs } from "./useCrowdInputs";

function item(id: string, title = id): QueueItem {
  return {
    id,
    trackId: null,
    filePath: `/music/${id}.flac`,
    title,
    artist: "x",
    key: null,
    bpm: 128,
    durationSeconds: 300,
    status: "playing",
  };
}

function snapshot(current: QueueItem | null, playing: boolean, position = 10): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: current?.filePath ?? null,
      playing: current !== null,
      paused: current !== null && !playing,
      positionSeconds: current ? position : null,
      durationSeconds: current ? 300 : null,
      volume: 80,
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

let clock = 0;
let push: (s: PlayerSnapshot) => void = () => undefined;
let levels: (r: PlayerLevels) => void = () => undefined;

beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  (window as unknown as { cuepoint: unknown }).cuepoint = {
    player: {
      subscribeState: (cb: (s: PlayerSnapshot) => void) => {
        push = cb;
        return () => undefined;
      },
      getState: () => new Promise(() => undefined),
      subscribeLevels: (cb: (r: PlayerLevels) => void) => {
        levels = cb;
        return () => undefined;
      },
    },
  };
});

afterEach(() => {
  cleanup();
  resetPlayerStore();
  forgetWaveforms();
  vi.restoreAllMocks();
  delete (window as { cuepoint?: unknown }).cuepoint;
});

function mount(first: PlayerSnapshot) {
  const view = renderHook(() => useCrowdInputs());
  act(() => push(first));
  // The store starts empty, so the first track counts as new: let a late frame spend that.
  view.result.current.read(clock + 10_000);
  return view;
}

describe("useCrowdInputs", () => {
  it("names the track and says whether it plays", () => {
    const { result } = mount(snapshot(item("a", "Strobe"), true));
    expect(result.current.title).toBe("Strobe");
    expect(result.current.playing).toBe(true);
  });

  it("hands readings over once and drops ones older than a second", () => {
    const { result } = mount(snapshot(item("a"), true));
    act(() => levels({ rmsDb: -10, peakDb: 0, position: 1 }));
    clock = 1500;
    act(() => levels({ rmsDb: -12, peakDb: -3, position: 1 }));
    clock = 2300;
    const first = result.current.read(clock);
    // The first reading is 1.3 s old.
    expect(first.readings.map((r) => r.rmsDb)).toEqual([-12]);
    expect(result.current.read(clock).readings).toEqual([]);
  });

  it("flags a new track that starts playing while the crowd watches, once", () => {
    const { result } = mount(snapshot(item("a"), true));
    expect(result.current.read(1100).newTrack).toBe(false);
    clock = 5000;
    act(() => push(snapshot(item("b"), true)));
    clock = 5100;
    expect(result.current.read(clock).newTrack).toBe(true);
    expect(result.current.read(5200).newTrack).toBe(false);
  });

  it("does not flag a track that began while nothing was reading the frames", () => {
    const { result } = mount(snapshot(item("a"), true));
    clock = 5000;
    act(() => push(snapshot(item("b"), true)));
    // The window was hidden: the first frame back is 20 s later.
    clock = 25_000;
    expect(result.current.read(clock).newTrack).toBe(false);
  });

  it("flags a track loaded paused when it starts playing, not before", () => {
    const { result } = mount(snapshot(item("a"), true));
    clock = 5000;
    act(() => push(snapshot(item("b"), false)));
    clock = 9000;
    expect(result.current.read(clock).newTrack).toBe(false);
    act(() => push(snapshot(item("b"), true)));
    clock = 9100;
    expect(result.current.read(clock).newTrack).toBe(true);
  });

  it("does not flag a pause and resume of the same track", () => {
    const { result } = mount(snapshot(item("a"), true));
    clock = 3000;
    act(() => push(snapshot(item("a"), false)));
    clock = 3300;
    act(() => push(snapshot(item("a"), true)));
    expect(result.current.read(3400).newTrack).toBe(false);
  });
});
