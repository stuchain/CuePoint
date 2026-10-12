import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WaveformAnswer, WaveformDetail, WaveformDetailState } from "../../api/cuepointBridge.types";
import { DETAIL_LIMIT, DETAIL_TIMEOUT_MS, MAX_REQUESTS, POLL_MS, WaveformDetailCache } from "./waveformDetailCache";

/**
 * The zoomed waveforms the renderer holds (T4): asked for once, followed while
 * the engine makes them, a few kept, and emptied with the rest.
 */

function detail(trackId: number, state: WaveformDetailState, ready = false): WaveformAnswer<WaveformDetail> {
  return {
    refusal: null,
    value: {
      track_id: trackId,
      state,
      reason: null,
      rate_hz: ready ? 75 : null,
      duration_ms: ready ? 1_000 : null,
      columns: ready ? 75 : null,
      data: ready ? new Uint8Array(75 * 4) : null,
    },
  };
}

function setup(answers: (id: number, call: number) => WaveformAnswer<WaveformDetail>) {
  const calls = new Map<number, number>();
  const get = vi.fn(async ({ track_id }: { track_id: number }) => {
    const n = (calls.get(track_id) ?? 0) + 1;
    calls.set(track_id, n);
    return answers(track_id, n);
  });
  const requestDetail = vi.fn(async ({ track_id }: { track_id: number }) => ({
    refusal: null,
    value: { track_id, state: "working" as WaveformDetailState },
  }));
  const cache = new WaveformDetailCache({ bridge: () => ({ detail: get, requestDetail }) });
  return { cache, get, requestDetail };
}

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("WaveformDetailCache", () => {
  it("reads a ready detail once and asks for nothing more", async () => {
    const { cache, get, requestDetail } = setup((id) => detail(id, "ready", true));
    cache.show(1);
    expect(cache.read(1)).toEqual({ kind: "loading" });
    await flush();
    const entry = cache.read(1);
    expect(entry.kind === "detail" && entry.detail.state).toBe("ready");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(get).toHaveBeenCalledTimes(1);
    expect(requestDetail).not.toHaveBeenCalled();
  });

  it("requests a waiting detail once, then polls until it is ready", async () => {
    const { cache, get, requestDetail } = setup((id, call) =>
      call === 1 ? detail(id, "waiting") : call < 4 ? detail(id, "working") : detail(id, "ready", true),
    );
    cache.show(7);
    await flush();
    expect(requestDetail).toHaveBeenCalledTimes(1);
    expect(requestDetail).toHaveBeenCalledWith({ track_id: 7 });
    expect(get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(get).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(get).toHaveBeenCalledTimes(4);
    const entry = cache.read(7);
    expect(entry.kind === "detail" && entry.detail.state).toBe("ready");
    await vi.advanceTimersByTimeAsync(10 * POLL_MS);
    expect(get).toHaveBeenCalledTimes(4);
    expect(requestDetail).toHaveBeenCalledTimes(1);
  });

  it("follows a detail someone else asked for without asking", async () => {
    const { cache, get, requestDetail } = setup((id, call) =>
      call < 2 ? detail(id, "working") : detail(id, "ready", true),
    );
    cache.show(2);
    await flush();
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(get).toHaveBeenCalledTimes(2);
    expect(requestDetail).not.toHaveBeenCalled();
  });

  it("stops at a state that will not change", async () => {
    for (const state of ["missing", "failed", "unavailable", "unchecked"] as const) {
      const { cache, get, requestDetail } = setup((id) => detail(id, state));
      cache.show(3);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(get, state).toHaveBeenCalledTimes(1);
      expect(requestDetail, state).not.toHaveBeenCalled();
    }
  });

  it("gives up after the file timeout, in an error rather than a pending state", async () => {
    const { cache, get } = setup((id) => detail(id, "working"));
    cache.show(4);
    await vi.advanceTimersByTimeAsync(DETAIL_TIMEOUT_MS + 10 * POLL_MS);
    const before = get.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * POLL_MS);
    expect(get.mock.calls.length).toBe(before);
    expect(before).toBeLessThanOrEqual(DETAIL_TIMEOUT_MS / POLL_MS + 2);
    expect(cache.read(4).kind).toBe("error");
  });

  it("asks again when a poll after the request still reads waiting", async () => {
    const { cache, get, requestDetail } = setup((id, call) =>
      call < 3 ? detail(id, "waiting") : detail(id, "ready", true),
    );
    cache.show(8);
    await flush();
    expect(requestDetail).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(requestDetail).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(get).toHaveBeenCalledTimes(3);
    expect(requestDetail).toHaveBeenCalledTimes(2);
    const entry = cache.read(8);
    expect(entry.kind === "detail" && entry.detail.state).toBe("ready");
  });

  it("fails after the cap of requests when the engine never starts it", async () => {
    const { cache, get, requestDetail } = setup((id) => detail(id, "waiting"));
    cache.show(9);
    await vi.advanceTimersByTimeAsync(20 * POLL_MS);
    expect(requestDetail).toHaveBeenCalledTimes(MAX_REQUESTS);
    expect(cache.read(9).kind).toBe("error");
    const reads = get.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20 * POLL_MS);
    expect(get.mock.calls.length).toBe(reads);
  });

  it("fails when the request is refused", async () => {
    const get = vi.fn(async () => detail(1, "waiting"));
    const requestDetail = vi.fn(async () => ({
      value: null,
      refusal: { code: "INVALID_REQUEST" as const, message: "Engine busy" },
    }));
    const cache = new WaveformDetailCache({ bridge: () => ({ detail: get, requestDetail }) });
    cache.show(1);
    await flush();
    expect(cache.read(1)).toEqual({ kind: "error", message: "Engine busy" });
    await vi.advanceTimersByTimeAsync(5 * POLL_MS);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("ends polling when a request answers missing or unchecked", async () => {
    for (const state of ["missing", "unchecked"] as const) {
      const get = vi.fn(async () => detail(1, "waiting"));
      const requestDetail = vi.fn(async () => ({ refusal: null, value: { track_id: 1, state } }));
      const cache = new WaveformDetailCache({ bridge: () => ({ detail: get, requestDetail }) });
      cache.show(1);
      await vi.advanceTimersByTimeAsync(5 * POLL_MS);
      expect(get, state).toHaveBeenCalledTimes(1);
      const entry = cache.read(1);
      expect(entry.kind === "detail" && entry.detail.state, state).toBe(state);
    }
  });

  it("stops polling when nothing shows the track any more", async () => {
    const { cache, get } = setup((id) => detail(id, "working"));
    const release = cache.show(5);
    await flush();
    release();
    await vi.advanceTimersByTimeAsync(10 * POLL_MS);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("holds an error and says why", async () => {
    const get = vi.fn(async () => ({
      value: null,
      refusal: { code: "INVALID_REQUEST" as const, message: "No such track" },
    }));
    const cache = new WaveformDetailCache({ bridge: () => ({ detail: get, requestDetail: vi.fn() }) });
    cache.show(1);
    await flush();
    expect(cache.read(1)).toEqual({ kind: "error", message: "No such track" });
  });

  it("holds an error when the bridge throws", async () => {
    const get = vi.fn(async () => {
      throw new Error("offline");
    });
    const cache = new WaveformDetailCache({ bridge: () => ({ detail: get, requestDetail: vi.fn() }) });
    cache.show(1);
    await flush();
    expect(cache.read(1)).toEqual({ kind: "error", message: "offline" });
  });

  it("does nothing without a bridge", async () => {
    const cache = new WaveformDetailCache({ bridge: () => undefined });
    cache.show(1);
    await flush();
    expect(cache.read(1)).toEqual({ kind: "loading" });
  });

  it("keeps only the few most recently read", async () => {
    const { cache } = setup((id) => detail(id, "ready", true));
    for (let id = 1; id <= DETAIL_LIMIT + 2; id += 1) {
      const release = cache.show(id);
      await flush();
      release();
    }
    expect(cache.size).toBe(DETAIL_LIMIT);
    expect(cache.read(1)).toEqual({ kind: "loading" });
    expect(cache.read(DETAIL_LIMIT + 2).kind).toBe("detail");
  });

  it("tells its listeners when an answer arrives", async () => {
    const { cache } = setup((id) => detail(id, "ready", true));
    const listener = vi.fn();
    cache.subscribe(listener);
    cache.show(1);
    await flush();
    expect(listener).toHaveBeenCalled();
  });

  it("is emptied, and asks again for what is shown", async () => {
    const { cache, get } = setup((id) => detail(id, "ready", true));
    cache.show(1);
    await flush();
    cache.forget();
    expect(cache.read(1)).toEqual({ kind: "loading" });
    await flush();
    expect(get).toHaveBeenCalledTimes(2);
    expect(cache.read(1).kind).toBe("detail");
  });

  it("drops an answer that arrives after it was emptied", async () => {
    let release: (a: WaveformAnswer<WaveformDetail>) => void = () => undefined;
    const slow = new Promise<WaveformAnswer<WaveformDetail>>((resolve) => {
      release = resolve;
    });
    const get = vi
      .fn()
      .mockReturnValueOnce(slow)
      .mockResolvedValue(detail(1, "ready", true));
    const cache = new WaveformDetailCache({ bridge: () => ({ detail: get, requestDetail: vi.fn() }) });
    cache.show(1);
    cache.forget();
    release(detail(1, "working"));
    await flush();
    const entry = cache.read(1);
    expect(entry.kind === "detail" && entry.detail.state).toBe("ready");
  });
});
