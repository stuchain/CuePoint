import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type {
  CuePointBridge,
  WaveformAnalysisStatus,
  WaveformAnswer,
  WaveformsBridge,
} from "../../api/cuepointBridge.types";
import { useWaveformAnalysis } from "./useWaveformAnalysis";

/**
 * Following the waveform analysis (WAVE-03): read while mounted, replaced at
 * once by what Pause and Resume answer, a refusal handed back to say, and a
 * build without the namespace left alone.
 */
function status(overrides: Partial<WaveformAnalysisStatus> = {}): WaveformAnalysisStatus {
  return {
    state: "idle",
    paused: false,
    job_id: null,
    present: 10,
    analysed: 10,
    failed: 0,
    remaining: 0,
    rate_per_hour: null,
    eta_seconds: null,
    reason: null,
    ...overrides,
  };
}

const answer = (value: WaveformAnalysisStatus): WaveformAnswer<WaveformAnalysisStatus> => ({
  value,
  refusal: null,
});

let waveforms: { [K in keyof WaveformsBridge]: ReturnType<typeof vi.fn> };

function install(bridge: Partial<CuePointBridge> | undefined): void {
  (window as unknown as { cuepoint?: Partial<CuePointBridge> }).cuepoint = bridge;
}

beforeEach(() => {
  waveforms = {
    analysis: vi.fn().mockResolvedValue(answer(status())),
    pause: vi.fn().mockResolvedValue(answer(status({ state: "paused", paused: true }))),
    resume: vi.fn().mockResolvedValue(answer(status({ state: "running", job_id: "job-1" }))),
  };
  install({ waveforms: waveforms as unknown as WaveformsBridge });
});

afterEach(() => {
  install(undefined);
  vi.useRealTimers();
});

describe("useWaveformAnalysis", () => {
  it("reads the analysis as it mounts", async () => {
    const { result } = renderHook(() => useWaveformAnalysis());

    await waitFor(() => expect(result.current.status?.state).toBe("idle"));
    expect(result.current.supported).toBe(true);
  });

  it("reads it again on its interval, and stops when it unmounts", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useWaveformAnalysis(1000));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(waveforms.analysis).toHaveBeenCalledTimes(3);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(waveforms.analysis).toHaveBeenCalledTimes(3);
  });

  it("takes what Pause and Resume answer at once", async () => {
    const { result } = renderHook(() => useWaveformAnalysis());
    await waitFor(() => expect(result.current.status).not.toBeNull());

    let refusal: unknown = "unset";
    await act(async () => {
      refusal = await result.current.pause();
    });
    expect(refusal).toBeNull();
    expect(result.current.status?.state).toBe("paused");

    await act(async () => {
      await result.current.resume();
    });
    expect(result.current.status?.state).toBe("running");
    expect(waveforms.resume).toHaveBeenCalledTimes(1);
  });

  it("hands a refusal back and keeps the last state", async () => {
    waveforms.pause.mockResolvedValue({
      value: null,
      refusal: { code: "WAVEFORMS_SETTING_FAILED", message: "The waveform setting could not be saved" },
    });
    const { result } = renderHook(() => useWaveformAnalysis());
    await waitFor(() => expect(result.current.status).not.toBeNull());

    let refusal: { code: string } | null = null;
    await act(async () => {
      refusal = await result.current.pause();
    });

    expect(refusal).toMatchObject({ code: "WAVEFORMS_SETTING_FAILED" });
    expect(result.current.status?.state).toBe("idle");
    expect(result.current.busy).toBe(false);
  });

  it("says why it could not read", async () => {
    waveforms.analysis.mockRejectedValue(new Error("Engine offline"));
    const { result } = renderHook(() => useWaveformAnalysis());

    await waitFor(() => expect(result.current.error).toBe("Engine offline"));
    expect(result.current.status).toBeNull();
  });

  it("leaves a build without the namespace alone", async () => {
    install({});
    const { result } = renderHook(() => useWaveformAnalysis());

    expect(result.current.supported).toBe(false);
    await act(async () => {
      expect(await result.current.pause()).toBeNull();
    });
    expect(result.current.status).toBeNull();
  });
});
