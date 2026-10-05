import { describe, expect, it, vi } from "vitest";

import type {
  WaveformAnalysisStatus,
  WaveformAnswer,
  WaveformBatch,
  WaveformTrack,
  WaveformTrackState,
} from "../../api/cuepointBridge.types";
import { BATCH_SIZE, REFRESH_MS, RETRY_MS, WaveformCache } from "./waveformCache";

/**
 * The waveforms the renderer holds (WAVE-05): asked for in batches of at most
 * 200, kept up to a bound, refreshed while a shown track waits for the
 * analysis, and emptied on demand.
 */

const QUERY = { width: 120, marks: false };

function track(trackId: number, state: WaveformTrackState = "ready"): WaveformTrack {
  return {
    track_id: trackId,
    state,
    reason: null,
    duration_ms: state === "ready" ? 1_000 : null,
    data: state === "ready" ? new Uint8Array(480) : null,
    marks: null,
  };
}

function status(analysed: number): WaveformAnalysisStatus {
  return {
    state: "running",
    paused: false,
    job_id: "job",
    present: 10,
    analysed,
    failed: 0,
    remaining: 10 - analysed,
    rate_per_hour: null,
    eta_seconds: null,
    reason: null,
    store_bytes: 0,
  };
}

/** A cache over a fake bridge, a fake clock and timers a test runs by hand. */
function setup(states: (id: number) => WaveformTrackState | "unknown" = () => "ready", limit?: number) {
  let now = 0;
  const scheduled: (() => void)[] = [];
  const intervals = new Map<number, () => void>();
  let nextInterval = 1;
  const analysed = { value: 0 };
  const get = vi.fn(
    async (params: { track_ids: number[]; width: number; marks?: boolean }): Promise<WaveformAnswer<WaveformBatch>> => ({
      value: {
        width: params.width,
        paused: false,
        waveforms: params.track_ids
          .filter((id) => states(id) !== "unknown")
          .map((id) => track(id, states(id) as WaveformTrackState)),
        unknown: params.track_ids.filter((id) => states(id) === "unknown"),
      },
      refusal: null,
    }),
  );
  const analysis = vi.fn(async () => ({ value: status(analysed.value), refusal: null }) as WaveformAnswer<WaveformAnalysisStatus>);
  const cache = new WaveformCache({
    bridge: () => ({ get, analysis }),
    now: () => now,
    schedule: (run) => scheduled.push(run),
    setInterval: (run) => {
      const handle = nextInterval++;
      intervals.set(handle, run);
      return handle;
    },
    clearInterval: (handle) => intervals.delete(handle as number),
    limit,
  });
  const flush = async () => {
    while (scheduled.length) scheduled.shift()!();
    await Promise.resolve();
    await Promise.resolve();
  };
  return {
    cache,
    get,
    analysis,
    analysed,
    intervals,
    flush,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

describe("the waveform cache", () => {
  it("asks for everything wanted in one task in one request", async () => {
    const { cache, get, flush } = setup();
    cache.want([1, 2], QUERY);
    cache.want([3, 2], QUERY);
    await flush();

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith({ track_ids: [1, 2, 3], width: 120, marks: false });
    expect(cache.read(3, QUERY)).toMatchObject({ kind: "track", track: { track_id: 3 } });
  });

  it("asks for at most 200 ids at a time", async () => {
    const { cache, get, flush } = setup();
    cache.want(Array.from({ length: 450 }, (_, i) => i + 1), QUERY);
    await flush();

    expect(get.mock.calls.map(([params]) => params.track_ids.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 50]);
  });

  it("asks separately for each width, and for marks", async () => {
    const { cache, get, flush } = setup();
    cache.want([1], QUERY);
    cache.want([1], { width: 300, marks: false });
    cache.want([1], { width: 120, marks: true });
    await flush();

    expect(get.mock.calls.map(([p]) => [p.width, p.marks])).toEqual([
      [120, false],
      [300, false],
      [120, true],
    ]);
  });

  it("does not ask again for a track held or on its way", async () => {
    const { cache, get, flush } = setup();
    cache.want([1], QUERY);
    await flush();
    cache.want([1], QUERY);
    await flush();

    expect(get).toHaveBeenCalledTimes(1);
  });

  it("reads loading until a track is answered", () => {
    const { cache } = setup();
    expect(cache.read(1, QUERY)).toEqual({ kind: "loading" });
  });

  it("holds an id that is no track as such, and never asks for it again", async () => {
    const { cache, get, flush } = setup((id) => (id === 9 ? "unknown" : "ready"));
    cache.want([9], QUERY);
    await flush();
    cache.want([9], QUERY);
    await flush();

    expect(cache.read(9, QUERY)).toEqual({ kind: "unknown" });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("keeps at most its limit, dropping the least recently read", async () => {
    const { cache, flush } = setup(undefined, 3);
    cache.want([1, 2, 3], QUERY);
    await flush();
    cache.read(1, QUERY);
    cache.want([4], QUERY);
    await flush();

    expect(cache.size).toBe(3);
    expect(cache.read(2, QUERY)).toEqual({ kind: "loading" });
    expect(cache.read(1, QUERY).kind).toBe("track");
    expect(cache.read(4, QUERY).kind).toBe("track");
  });

  it("holds 2,000 answers by default", async () => {
    const { cache, flush } = setup();
    cache.want(Array.from({ length: 2_100 }, (_, i) => i + 1), QUERY);
    await flush();
    expect(cache.size).toBe(2_000);
  });

  it("holds a failed request as an error, and asks again only after a pause", async () => {
    const { cache, get, flush, tick } = setup();
    get.mockRejectedValueOnce(new Error("engine gone"));
    cache.want([1], QUERY);
    await flush();
    expect(cache.read(1, QUERY)).toEqual({ kind: "error", message: "engine gone" });

    cache.want([1], QUERY);
    await flush();
    expect(get).toHaveBeenCalledTimes(1);

    tick(RETRY_MS);
    cache.want([1], QUERY);
    await flush();
    expect(get).toHaveBeenCalledTimes(2);
    expect(cache.read(1, QUERY).kind).toBe("track");
  });

  it("holds a refusal as an error", async () => {
    const { cache, get, flush } = setup();
    get.mockResolvedValueOnce({
      value: null,
      refusal: { code: "INVALID_REQUEST", message: "width out of range" },
    });
    cache.want([1], QUERY);
    await flush();
    expect(cache.read(1, QUERY)).toEqual({ kind: "error", message: "width out of range" });
  });

  it("tells its listeners when answers arrive", async () => {
    const { cache, flush } = setup();
    const listener = vi.fn();
    const stop = cache.subscribe(listener);
    cache.want([1], QUERY);
    await flush();
    stop();
    cache.want([2], QUERY);
    await flush();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("empties on demand, and asks again for every track shown", async () => {
    const { cache, get, flush } = setup();
    const hide = cache.show([1, 2], QUERY);
    cache.want([3], QUERY);
    await flush();

    cache.forget();
    expect(cache.size).toBe(0);
    await flush();

    expect(get).toHaveBeenLastCalledWith({ track_ids: [1, 2], width: 120, marks: false });
    expect(cache.read(1, QUERY).kind).toBe("track");
    hide();
  });

  it("drops an answer that was on its way when the cache was emptied", async () => {
    const { cache, get, flush } = setup();
    let release: (value: WaveformAnswer<WaveformBatch>) => void = () => undefined;
    get.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    cache.want([1], QUERY);
    await flush();
    cache.forget();
    release({
      value: { width: 120, paused: false, waveforms: [track(1)], unknown: [] },
      refusal: null,
    });
    await flush();

    expect(cache.read(1, QUERY)).toEqual({ kind: "loading" });
  });

  describe("while a shown track waits for the analysis", () => {
    it("follows the analysis only while one does", async () => {
      let state: WaveformTrackState = "waiting";
      const { cache, intervals, flush } = setup(() => state);
      const hide = cache.show([1], QUERY);
      expect(intervals.size).toBe(0);
      await flush();
      expect(intervals.size).toBe(1);

      state = "ready";
      cache.refreshWaiting();
      await flush();
      expect(intervals.size).toBe(0);
      hide();
    });

    it("asks again when the analysis's finished count moves, at most every 2 seconds", async () => {
      let state: WaveformTrackState = "waiting";
      const { cache, get, analysed, flush, tick } = setup(() => state);
      const hide = cache.show([1, 2], QUERY);
      await flush();
      expect(get).toHaveBeenCalledTimes(1);

      await cache.poll(); // the first read notes the count, and asks once
      await flush();
      expect(get).toHaveBeenCalledTimes(2);

      tick(REFRESH_MS);
      await cache.poll(); // nothing moved
      await flush();
      expect(get).toHaveBeenCalledTimes(2);

      analysed.value = 1;
      await cache.poll();
      await flush();
      expect(get).toHaveBeenCalledTimes(3);
      expect(get).toHaveBeenLastCalledWith({ track_ids: [1, 2], width: 120, marks: false });

      analysed.value = 2;
      tick(REFRESH_MS - 1);
      await cache.poll();
      await flush();
      expect(get).toHaveBeenCalledTimes(3);

      state = "ready";
      analysed.value = 3;
      tick(REFRESH_MS);
      await cache.poll();
      await flush();
      expect(get).toHaveBeenCalledTimes(4);
      expect(cache.read(1, QUERY)).toMatchObject({ kind: "track", track: { state: "ready" } });
      hide();
    });

    it("asks again on its first read, for a track the analysis reached before it was followed", async () => {
      // Requested as it was shown, the track is analysed before the first
      // read of the analysis; that read notes a count which will never move
      // for it. Regression: it waited until something else was analysed.
      let state: WaveformTrackState = "waiting";
      const { cache, get, analysed, intervals, flush } = setup(() => state);
      const hide = cache.show([1], QUERY);
      await flush();
      expect(intervals.size).toBe(1);

      state = "ready";
      analysed.value = 10;
      await cache.poll();
      await flush();

      expect(get).toHaveBeenCalledTimes(2);
      expect(cache.read(1, QUERY)).toMatchObject({ kind: "track", track: { state: "ready" } });
      expect(intervals.size).toBe(0);
      hide();
    });

    it("starts afresh each time it follows the analysis again", async () => {
      let state: WaveformTrackState = "waiting";
      const { cache, get, flush, tick } = setup(() => state);
      const hide = cache.show([1], QUERY);
      await flush();
      await cache.poll();
      await flush();
      expect(get).toHaveBeenCalledTimes(2);
      hide();

      // Stopped following; a waiting track shown again is asked for on the
      // first read, though the count has not moved.
      tick(REFRESH_MS);
      cache.forget();
      state = "waiting";
      const again = cache.show([1], QUERY);
      await flush();
      const before = get.mock.calls.length;
      await cache.poll();
      await flush();
      expect(get.mock.calls.length).toBe(before + 1);
      again();
    });

    it("keeps showing the old answer while the new one is on its way", async () => {
      const { cache, flush } = setup(() => "waiting");
      const hide = cache.show([1], QUERY);
      await flush();
      cache.refreshWaiting();
      expect(cache.read(1, QUERY).kind).toBe("track");
      hide();
    });

    it("refreshes only tracks still shown", async () => {
      const { cache, get, flush } = setup(() => "waiting");
      const hide = cache.show([1], QUERY);
      cache.want([2], QUERY);
      await flush();
      hide();
      cache.refreshWaiting();
      await flush();
      expect(get).toHaveBeenCalledTimes(1);
    });
  });
});
