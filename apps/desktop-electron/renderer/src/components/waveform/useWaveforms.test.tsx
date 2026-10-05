import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WaveformAnswer, WaveformBatch } from "../../api/cuepointBridge.types";
import { WaveformCache } from "./waveformCache";
import { useWaveform, useWaveforms } from "./useWaveforms";

/**
 * The hook a view reads its waveforms through (WAVE-05): one request for
 * everything shown, re-read as answers arrive, and the cache told when the
 * view stops showing them.
 */
function setup() {
  const get = vi.fn(
    async (params: { track_ids: number[]; width: number; marks?: boolean }): Promise<WaveformAnswer<WaveformBatch>> => ({
      value: {
        width: params.width,
        paused: true,
        waveforms: params.track_ids.map((id) => ({
          track_id: id,
          state: "waiting" as const,
          reason: null,
          duration_ms: null,
          data: null,
          marks: params.marks ? { read: true, cues: [], grid: [] } : null,
        })),
        unknown: [],
      },
      refusal: null,
    }),
  );
  const cache = new WaveformCache({ bridge: () => ({ get, analysis: vi.fn() }) });
  return { cache, get };
}

describe("useWaveforms", () => {
  it("answers loading, then each track as the engine does", async () => {
    const { cache, get } = setup();
    const { result } = renderHook(() => useWaveforms([1, 2], 120, { cache, marks: true }));
    expect(result.current.get(1)).toEqual({ kind: "loading" });

    await waitFor(() => expect(result.current.get(2)?.kind).toBe("track"));

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith({ track_ids: [1, 2], width: 120, marks: true });
    expect(result.current.get(1)).toMatchObject({ kind: "track", paused: true, track: { state: "waiting" } });
  });

  it("does not ask again for the same ids in a new array", async () => {
    const { cache, get } = setup();
    const { result, rerender } = renderHook(({ ids }) => useWaveforms(ids, 120, { cache }), {
      initialProps: { ids: [1, 2] },
    });
    await waitFor(() => expect(result.current.get(1)?.kind).toBe("track"));
    rerender({ ids: [1, 2] });
    await act(async () => undefined);

    expect(get).toHaveBeenCalledTimes(1);
  });

  it("asks nothing for a width the engine does not answer", async () => {
    const { cache, get } = setup();
    const { result } = renderHook(() => useWaveforms([1], 8, { cache }));
    await act(async () => undefined);

    expect(get).not.toHaveBeenCalled();
    expect(result.current.get(1)).toEqual({ kind: "loading" });
  });

  it("stops showing its tracks when unmounted", () => {
    const { cache } = setup();
    const hide = vi.fn();
    const show = vi.spyOn(cache, "show").mockReturnValue(hide);
    const { unmount } = renderHook(() => useWaveforms([1], 120, { cache }));
    expect(show).toHaveBeenCalledWith([1], { width: 120, marks: false });

    unmount();

    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("answers one track, or null when none is shown", async () => {
    const { cache } = setup();
    const none = renderHook(() => useWaveform(null, 120, { cache }));
    expect(none.result.current).toBeNull();

    const one = renderHook(() => useWaveform(7, 120, { cache }));
    await waitFor(() => expect(one.result.current?.kind).toBe("track"));
  });
});
