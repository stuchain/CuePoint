import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type {
  CuePointBridge,
  WaveformAnalysisStatus,
  WaveformAnswer,
  WaveformsBridge,
} from "../../api/cuepointBridge.types";
import type { ReactNode } from "react";
import { createElement } from "react";

import { PageActiveContext } from "../shell/pageActive";
import { resetAnalysisStore } from "./analysisStore";
import { useWaveformAnalysis } from "./useWaveformAnalysis";
import { waveformCache } from "./waveformCache";

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
    store_bytes: 0,
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
  resetAnalysisStore();
  waveforms = {
    analysis: vi.fn().mockResolvedValue(answer(status())),
    pause: vi.fn().mockResolvedValue(answer(status({ state: "paused", paused: true }))),
    resume: vi.fn().mockResolvedValue(answer(status({ state: "running", job_id: "job-1" }))),
    get: vi.fn(),
    request: vi.fn(),
    detail: vi.fn(),
    requestDetail: vi.fn(),
    deleteData: vi.fn(),
  };
  install({ waveforms: waveforms as unknown as WaveformsBridge });
});

afterEach(() => {
  resetAnalysisStore();
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

  it("deletes the data, takes the state after it, and empties every view's waveforms", async () => {
    const forget = vi.spyOn(waveformCache, "forget");
    waveforms.deleteData.mockResolvedValue({
      value: {
        deleted: { waveforms: 10, freed_bytes: 4_096 },
        analysis: status({ state: "running", analysed: 0, remaining: 10, job_id: "job-2" }),
      },
      refusal: null,
    });
    const { result } = renderHook(() => useWaveformAnalysis());
    await waitFor(() => expect(result.current.status).not.toBeNull());

    let answer: unknown = null;
    await act(async () => {
      answer = await result.current.deleteData();
    });

    expect(answer).toEqual({ value: { waveforms: 10, freed_bytes: 4_096 }, refusal: null });
    expect(result.current.status?.state).toBe("running");
    expect(forget).toHaveBeenCalledTimes(1);
  });

  it("hands back a deletion's refusal and keeps every waveform", async () => {
    const forget = vi.spyOn(waveformCache, "forget");
    waveforms.deleteData.mockResolvedValue({
      value: null,
      refusal: { code: "WAVEFORMS_STORE_FAILED", message: "The waveform data could not be deleted" },
    });
    const { result } = renderHook(() => useWaveformAnalysis());
    await waitFor(() => expect(result.current.status).not.toBeNull());

    let answer: { refusal: { code: string } | null } | null = null;
    await act(async () => {
      answer = await result.current.deleteData();
    });

    expect(answer!.refusal).toMatchObject({ code: "WAVEFORMS_STORE_FAILED" });
    expect(forget).not.toHaveBeenCalled();
    expect(result.current.status?.state).toBe("idle");
  });

  describe("one shared poll", () => {
    const many = (count: number, active = true) =>
      renderHook(
        () => {
          const all = Array.from({ length: count }, () => useWaveformAnalysis(2000));
          return all;
        },
        {
          wrapper: ({ children }: { children: ReactNode }) =>
            createElement(PageActiveContext.Provider, { value: active }, children),
        },
      );

    it("reads once per interval however many hooks are mounted", async () => {
      vi.useFakeTimers();
      const { result } = many(30);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(waveforms.analysis).toHaveBeenCalledTimes(1);
      expect(result.current.every((one) => one.status?.state === "idle")).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(waveforms.analysis).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(waveforms.analysis).toHaveBeenCalledTimes(3);
    });

    it("never starts a read while one is pending", async () => {
      vi.useFakeTimers();
      let release: (value: WaveformAnswer<WaveformAnalysisStatus>) => void = () => {};
      waveforms.analysis.mockImplementation(
        () => new Promise((resolve) => (release = resolve)),
      );
      many(5);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(waveforms.analysis).toHaveBeenCalledTimes(1);

      await act(async () => {
        release(answer(status({ state: "running" })));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(waveforms.analysis).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(waveforms.analysis).toHaveBeenCalledTimes(2);
    });

    it("does not read for a hidden page", async () => {
      vi.useFakeTimers();
      many(3, false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(waveforms.analysis).not.toHaveBeenCalled();
    });

    it("gives a pause answer to every consumer", async () => {
      const { result } = many(4);
      await waitFor(() => expect(result.current[0]!.status).not.toBeNull());

      await act(async () => {
        await result.current[0]!.pause();
      });

      expect(result.current.map((one) => one.status?.state)).toEqual([
        "paused",
        "paused",
        "paused",
        "paused",
      ]);
      expect(waveforms.pause).toHaveBeenCalledTimes(1);
    });

    it("does not let a stale read overwrite a later Pause answer", async () => {
      vi.useFakeTimers();
      let release: (value: WaveformAnswer<WaveformAnalysisStatus>) => void = () => {};
      waveforms.analysis.mockImplementation(
        () => new Promise((resolve) => (release = resolve)),
      );
      const { result } = many(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await result.current[0]!.pause();
      });
      expect(result.current[1]!.status?.state).toBe("paused");

      await act(async () => {
        release(answer(status({ state: "running" })));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current[1]!.status?.state).toBe("paused");
    });

    it("does not let a stale failure set an error after a Pause answer", async () => {
      vi.useFakeTimers();
      let fail: (cause: unknown) => void = () => {};
      waveforms.analysis.mockImplementation(
        () => new Promise((_, reject) => (fail = reject)),
      );
      const { result } = many(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await result.current[0]!.pause();
      });

      await act(async () => {
        fail(new Error("Engine offline"));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current[1]!.error).toBeNull();
      expect(result.current[1]!.status?.state).toBe("paused");
    });

    it("stops reading when the last hook unmounts", async () => {
      vi.useFakeTimers();
      const { unmount } = many(3);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });
      const before = waveforms.analysis.mock.calls.length;
      expect(before).toBe(2);

      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(waveforms.analysis).toHaveBeenCalledTimes(before);
    });

    it("starts reading when a hidden page is shown", async () => {
      vi.useFakeTimers();
      const wrap = (active: boolean) => ({
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(PageActiveContext.Provider, { value: active }, children),
      });
      function useAnalysis() {
        return useWaveformAnalysis(2000);
      }
      const hook = useAnalysis;
      const view = renderHook(hook, wrap(false));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(waveforms.analysis).not.toHaveBeenCalled();

      view.unmount();
      renderHook(hook, wrap(true));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(waveforms.analysis).toHaveBeenCalledTimes(1);
    });
  });
});
