import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlayerSnapshot, QueueItem, QueueWindow } from "../../api/cuepointBridge.types";
import { EMPTY_AUDIO_STATE } from "../player/playerFormat";
import { resetPlayerStore } from "../player/playerStore";
import { setSelectedTrack } from "../shell/selectedTrack";
import { useWaveformPrefetch } from "./useWaveformPrefetch";
import { PREFETCH_DEBOUNCE_MS } from "./waveformPrefetch";

/**
 * The hook that makes the strip's detail ahead of play: a selection in a list,
 * and the track after the current one in the queue.
 */

function item(trackId: number | null, id = `q${trackId}`): QueueItem {
  return {
    id,
    trackId,
    filePath: `/music/${id}.flac`,
    title: id,
    artist: "x",
    key: null,
    bpm: null,
    durationSeconds: 300,
    status: "pending",
  };
}

function snapshot(
  length: number,
  currentIndex: number,
  current: QueueItem | null,
  repeat: "off" | "all" | "one" = "off",
): PlayerSnapshot {
  return {
    status: { available: true, running: true, reconnecting: false, restartAttempts: 0 },
    playback: {
      filePath: current?.filePath ?? null,
      playing: current !== null,
      paused: false,
      positionSeconds: 0,
      durationSeconds: 300,
      volume: 80,
      muted: false,
    },
    queue: { length, currentId: current?.id ?? null, currentIndex, currentItem: current, shuffle: false, repeat },
    audio: EMPTY_AUDIO_STATE,
  };
}

function Probe({
  cache,
  enabled = true,
}: {
  cache: { prefetch: (id: number) => { done: Promise<void>; cancel: () => void } };
  enabled?: boolean;
}) {
  useWaveformPrefetch({ enabled }, cache);
  return null;
}

let push: (state: PlayerSnapshot) => void;
let queueWindow: ReturnType<typeof vi.fn>;
let queue: QueueItem[];

function install(initial: PlayerSnapshot | null) {
  queue = [];
  queueWindow = vi.fn(async (offset: number, limit: number): Promise<QueueWindow> => {
    const items = queue.slice(offset, offset + limit);
    return { items, offset, total: queue.length } as QueueWindow;
  });
  window.cuepoint = {
    player: {
      getState: vi.fn().mockResolvedValue(initial),
      subscribeState: vi.fn((onState: (state: PlayerSnapshot) => void) => {
        push = onState;
        if (initial) onState(initial);
        return vi.fn();
      }),
      queueWindow,
    },
  } as unknown as typeof window.cuepoint;
}

function makeCache() {
  const calls: number[] = [];
  const cancels = vi.fn();
  return {
    calls,
    cancels,
    cache: {
      prefetch: vi.fn((id: number) => {
        calls.push(id);
        return { done: new Promise<void>(() => undefined), cancel: cancels };
      }),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetPlayerStore();
  setSelectedTrack(null);
});
afterEach(() => {
  cleanup();
  setSelectedTrack(null);
  vi.useRealTimers();
});

describe("useWaveformPrefetch", () => {
  it("prefetches the selected library track after the pause, and not before", async () => {
    install(null);
    const { cache, calls } = makeCache();
    render(<Probe cache={cache} />);
    act(() => setSelectedTrack({ id: 42, key: null }));
    await act(() => vi.advanceTimersByTimeAsync(PREFETCH_DEBOUNCE_MS - 1));
    expect(calls).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(calls).toEqual([42]);
  });

  it("follows arrow-key selection: only where it stops is asked for", async () => {
    install(null);
    const { cache, calls } = makeCache();
    render(<Probe cache={cache} />);
    for (const id of [1, 2, 3, 4]) {
      act(() => setSelectedTrack({ id, key: null }));
      await act(() => vi.advanceTimersByTimeAsync(80));
    }
    await act(() => vi.advanceTimersByTimeAsync(PREFETCH_DEBOUNCE_MS));
    expect(calls).toEqual([4]);
  });

  it("ignores a selection that is not a library track", async () => {
    install(null);
    const { cache, calls } = makeCache();
    render(<Probe cache={cache} />);
    act(() => setSelectedTrack({ id: "beatport:9", key: null }));
    await act(() => vi.advanceTimersByTimeAsync(2 * PREFETCH_DEBOUNCE_MS));
    expect(calls).toEqual([]);
  });

  it("prefetches the next track in the queue, and the head of a queue when nothing plays", async () => {
    install(snapshot(3, -1, null));
    const { cache, calls } = makeCache();
    queue = [item(10), item(11), item(12)];
    render(<Probe cache={cache} />);
    await act(() => vi.advanceTimersByTimeAsync(PREFETCH_DEBOUNCE_MS + 10));
    expect(queueWindow).toHaveBeenCalledWith(0, 1);
    expect(calls).toEqual([10]);
  });

  it("moves to the track after the one that starts, never the playing one", async () => {
    install(snapshot(3, -1, null));
    const { cache, calls } = makeCache();
    queue = [item(10), item(11), item(12)];
    render(<Probe cache={cache} />);
    await act(() => vi.advanceTimersByTimeAsync(PREFETCH_DEBOUNCE_MS + 10));
    act(() => push(snapshot(3, 0, queue[0]!)));
    await act(() => vi.advanceTimersByTimeAsync(PREFETCH_DEBOUNCE_MS + 10));
    expect(queueWindow).toHaveBeenLastCalledWith(1, 1);
    expect(calls).toEqual([10, 11]);
    expect(calls.filter((id) => id === 10)).toHaveLength(1);
  });

  it("picks up a track queued next while one plays", async () => {
    install(snapshot(2, 0, item(1)));
    const { cache, calls } = makeCache();
    queue = [item(1), item(2)];
    render(<Probe cache={cache} />);
    await act(() => vi.advanceTimersByTimeAsync(PREFETCH_DEBOUNCE_MS + 10));
    expect(calls).toEqual([2]);
    queue = [item(1), item(99), item(2)];
    act(() => push(snapshot(3, 0, item(1))));
    await act(() => vi.advanceTimersByTimeAsync(PREFETCH_DEBOUNCE_MS + 10));
    expect(calls).toEqual([2, 99]);
  });

  it("wraps to the head of the queue after the last track when it repeats all, and not otherwise", async () => {
    install(snapshot(2, 1, item(2), "all"));
    const { cache, calls } = makeCache();
    queue = [item(1), item(2)];
    render(<Probe cache={cache} />);
    await act(() => vi.advanceTimersByTimeAsync(PREFETCH_DEBOUNCE_MS + 10));
    expect(queueWindow).toHaveBeenLastCalledWith(0, 1);
    expect(calls).toEqual([1]);
    act(() => push(snapshot(2, 1, item(2), "off")));
    await act(() => vi.advanceTimersByTimeAsync(PREFETCH_DEBOUNCE_MS + 10));
    expect(queueWindow).toHaveBeenLastCalledWith(2, 1);
  });

  it("makes nothing ahead while the strip is off", async () => {
    install(snapshot(2, 0, item(1)));
    const { cache, calls } = makeCache();
    queue = [item(1), item(2)];
    render(<Probe cache={cache} enabled={false} />);
    act(() => setSelectedTrack({ id: 5, key: null }));
    await act(() => vi.advanceTimersByTimeAsync(2 * PREFETCH_DEBOUNCE_MS));
    expect(calls).toEqual([]);
  });

  it("does nothing for a queue entry without a library id, and stops on unmount", async () => {
    install(snapshot(2, 0, item(1)));
    const { cache, calls, cancels } = makeCache();
    queue = [item(1), item(null, "stream")];
    const view = render(<Probe cache={cache} />);
    await act(() => vi.advanceTimersByTimeAsync(PREFETCH_DEBOUNCE_MS + 10));
    expect(calls).toEqual([]);
    act(() => setSelectedTrack({ id: 5, key: null }));
    await act(() => vi.advanceTimersByTimeAsync(PREFETCH_DEBOUNCE_MS + 10));
    expect(calls).toEqual([5]);
    view.unmount();
    expect(cancels).toHaveBeenCalledTimes(1);
  });
});
