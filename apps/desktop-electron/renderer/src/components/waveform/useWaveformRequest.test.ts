import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WaveformLoudness, WaveformTrackState } from "../../api/cuepointBridge.types";
import type { WaveformEntry } from "./waveformCache";
import { useWaveformRequest, waitsForAnalysis } from "./useWaveformRequest";

/**
 * A track a person looks at goes first in the analysis (WAVE-06), only while
 * it waits for it, and once while it stays shown.
 */

function entry(
  state: WaveformTrackState,
  paused = false,
  loudness: WaveformLoudness | null = null,
): WaveformEntry {
  return {
    kind: "track",
    paused,
    track: { track_id: 1, state, reason: null, duration_ms: null, loudness, data: null, marks: null },
  };
}

const MEASURED: WaveformLoudness = { integrated_lufs: -8.4, peak_dbfs: -0.3, reason: null };

function setup() {
  const request = vi.fn().mockResolvedValue({ value: { requested: [1], job_id: "job" }, refusal: null });
  const bridge = () => ({ request });
  return { request, bridge };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("waitsForAnalysis", () => {
  it("is true only for a track that waits", () => {
    expect(waitsForAnalysis(entry("waiting"))).toBe(true);
    expect(waitsForAnalysis(entry("waiting", true))).toBe(true);
    for (const state of ["ready", "failed", "missing", "unchecked", "unavailable"] as const) {
      expect(waitsForAnalysis(entry(state))).toBe(false);
    }
    expect(waitsForAnalysis({ kind: "loading" })).toBe(false);
    expect(waitsForAnalysis({ kind: "unknown" })).toBe(false);
    expect(waitsForAnalysis({ kind: "error", message: "x" })).toBe(false);
    expect(waitsForAnalysis(null)).toBe(false);
  });
});

describe("useWaveformRequest", () => {
  it("asks for a waiting track, paused or not", async () => {
    const { request, bridge } = setup();
    renderHook(() => useWaveformRequest(1, entry("waiting", true), { bridge }));
    await waitFor(() => expect(request).toHaveBeenCalledWith({ track_ids: [1] }));
  });

  it("asks nothing until the answer says the track waits", async () => {
    const { request, bridge } = setup();
    const { rerender } = renderHook(({ answer }) => useWaveformRequest(1, answer, { bridge }), {
      initialProps: { answer: { kind: "loading" } as WaveformEntry },
    });
    await settle();
    expect(request).not.toHaveBeenCalled();

    rerender({ answer: entry("waiting") });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  });

  it("asks once while the track stays shown, however often its answer is read", async () => {
    const { request, bridge } = setup();
    const { rerender } = renderHook(({ answer }) => useWaveformRequest(1, answer, { bridge }), {
      initialProps: { answer: entry("waiting") },
    });
    rerender({ answer: entry("waiting") });
    rerender({ answer: entry("waiting", true) });
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("asks for each new track, and again for one shown again", async () => {
    const { request, bridge } = setup();
    const { rerender } = renderHook(({ id }) => useWaveformRequest(id, entry("waiting"), { bridge }), {
      initialProps: { id: 1 as number | null },
    });
    rerender({ id: 2 });
    rerender({ id: null });
    rerender({ id: 1 });
    await settle();

    expect(request.mock.calls.map(([params]) => params.track_ids)).toEqual([[1], [2], [1]]);
  });

  it("asks nothing for a track that has its waveform or cannot have one", async () => {
    const { request, bridge } = setup();
    for (const state of ["ready", "failed", "missing", "unchecked", "unavailable"] as const) {
      renderHook(() => useWaveformRequest(1, entry(state), { bridge }));
    }
    renderHook(() => useWaveformRequest(null, entry("waiting"), { bridge }));
    await settle();
    expect(request).not.toHaveBeenCalled();
  });

  it("stays quiet when the request fails, and without a bridge", async () => {
    const request = vi.fn().mockRejectedValue(new Error("engine unreachable"));
    renderHook(() => useWaveformRequest(1, entry("waiting"), { bridge: () => ({ request }) }));
    renderHook(() => useWaveformRequest(1, entry("waiting"), { bridge: () => undefined }));
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("a view that shows the loudness (WAVE-08)", () => {
  it("waits for a ready track's loudness still to be measured", () => {
    expect(waitsForAnalysis(entry("ready"), true)).toBe(true);
    expect(waitsForAnalysis(entry("ready", false, MEASURED), true)).toBe(false);
    expect(waitsForAnalysis(entry("ready"), false)).toBe(false);
    expect(waitsForAnalysis(entry("failed"), true)).toBe(false);
    expect(waitsForAnalysis(entry("waiting"), true)).toBe(true);
  });

  it("asks for a track missing only its loudness", async () => {
    const { request, bridge } = setup();
    renderHook(() => useWaveformRequest(1, entry("ready"), { loudness: true, bridge }));
    await waitFor(() => expect(request).toHaveBeenCalledWith({ track_ids: [1] }));
  });

  it("asks nothing for a measured track, nor from a view that only draws", async () => {
    const { request, bridge } = setup();
    renderHook(() => useWaveformRequest(1, entry("ready", false, MEASURED), { loudness: true, bridge }));
    renderHook(() => useWaveformRequest(2, entry("ready"), { bridge }));
    await settle();
    expect(request).not.toHaveBeenCalled();
  });
});
