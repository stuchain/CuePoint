import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PREFETCH_DEBOUNCE_MS, WaveformPrefetcher } from "./waveformPrefetch";

/**
 * Which tracks' zoomed waveforms are made ahead of play: the one selected in a
 * list (after a pause in the arrow keys), the next in the queue, one at a time,
 * never the track already playing, and stale ones dropped.
 */

interface Call {
  id: number;
  cancel: ReturnType<typeof vi.fn>;
  finish: () => void;
}

function setup() {
  const calls: Call[] = [];
  const cache = {
    prefetch: vi.fn((id: number) => {
      let finish = () => {};
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const cancel = vi.fn(() => finish());
      calls.push({ id, cancel, finish });
      return { done, cancel };
    }),
  };
  const prefetcher = new WaveformPrefetcher(cache);
  return { cache, calls, prefetcher };
}

const settle = async () => {
  await vi.advanceTimersByTimeAsync(0);
};
const wait = async (ms = PREFETCH_DEBOUNCE_MS) => {
  await vi.advanceTimersByTimeAsync(ms);
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("WaveformPrefetcher", () => {
  it("waits out a pause of about 300 ms after a selection before asking", async () => {
    const { cache, prefetcher } = setup();
    expect(PREFETCH_DEBOUNCE_MS).toBe(300);
    prefetcher.setSelected(4);
    await wait(PREFETCH_DEBOUNCE_MS - 1);
    expect(cache.prefetch).not.toHaveBeenCalled();
    await wait(1);
    expect(cache.prefetch).toHaveBeenCalledWith(4);
  });

  it("asks only for where the arrow keys stop", async () => {
    const { cache, prefetcher } = setup();
    for (const id of [1, 2, 3, 4, 5]) {
      prefetcher.setSelected(id);
      await wait(100);
    }
    expect(cache.prefetch).not.toHaveBeenCalled();
    await wait();
    expect(cache.prefetch.mock.calls).toEqual([[5]]);
  });

  it("asks for the next track in the queue, ahead of the selection", async () => {
    const { calls, prefetcher } = setup();
    prefetcher.setSelected(7);
    prefetcher.setNext(9);
    await wait();
    expect(calls.map((c) => c.id)).toEqual([9]);
    calls[0]!.finish();
    await settle();
    expect(calls.map((c) => c.id)).toEqual([9, 7]);
  });

  it("is one request in flight, the next starting when it ends", async () => {
    const { calls, prefetcher } = setup();
    prefetcher.setSelected(1);
    prefetcher.setNext(2);
    await wait();
    await wait(5_000);
    expect(calls).toHaveLength(1);
    calls[0]!.finish();
    await settle();
    expect(calls).toHaveLength(2);
    calls[1]!.finish();
    await settle();
    await wait(5_000);
    expect(calls).toHaveLength(2);
  });

  it("does not ask twice for a track it has made, or the same one set again", async () => {
    const { calls, prefetcher } = setup();
    prefetcher.setSelected(3);
    await wait();
    prefetcher.setSelected(3);
    await wait();
    calls[0]!.finish();
    await settle();
    prefetcher.setSelected(3);
    prefetcher.setNext(3);
    await wait();
    expect(calls.map((c) => c.id)).toEqual([3]);
  });

  it("never asks for the track that is playing: the strip owns it", async () => {
    const { calls, prefetcher } = setup();
    prefetcher.setPlaying(5);
    prefetcher.setSelected(5);
    prefetcher.setNext(6);
    await wait();
    expect(calls.map((c) => c.id)).toEqual([6]);
    calls[0]!.finish();
    await settle();
    expect(calls.map((c) => c.id)).toEqual([6]);
  });

  it("drops a stale request when the selection moves on, and asks for the new one", async () => {
    const { calls, prefetcher } = setup();
    prefetcher.setSelected(1);
    await wait();
    expect(calls.map((c) => c.id)).toEqual([1]);
    prefetcher.setSelected(2);
    await wait();
    expect(calls[0]!.cancel).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.id)).toEqual([1, 2]);
  });

  it("keeps a request going when the track is still wanted", async () => {
    const { calls, prefetcher } = setup();
    prefetcher.setNext(4);
    await wait();
    prefetcher.setSelected(8);
    await wait();
    expect(calls[0]!.cancel).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
  });

  it("asks again for a track that left and came back", async () => {
    const { calls, prefetcher } = setup();
    prefetcher.setSelected(1);
    await wait();
    calls[0]!.finish();
    await settle();
    prefetcher.setSelected(2);
    await wait();
    calls[1]!.finish();
    await settle();
    prefetcher.setSelected(1);
    await wait();
    expect(calls.map((c) => c.id)).toEqual([1, 2, 1]);
  });

  it("asks for nothing once nothing is wanted, and cancels what is going", async () => {
    const { cache, calls, prefetcher } = setup();
    prefetcher.setSelected(1);
    await wait();
    prefetcher.setSelected(null);
    await wait();
    expect(calls[0]!.cancel).toHaveBeenCalledTimes(1);
    await wait(5_000);
    expect(cache.prefetch).toHaveBeenCalledTimes(1);
  });

  it("stops everything when disposed", async () => {
    const { cache, calls, prefetcher } = setup();
    prefetcher.setSelected(1);
    await wait();
    prefetcher.setNext(2);
    prefetcher.dispose();
    expect(calls[0]!.cancel).toHaveBeenCalledTimes(1);
    await wait(5_000);
    expect(cache.prefetch).toHaveBeenCalledTimes(1);
  });
});
