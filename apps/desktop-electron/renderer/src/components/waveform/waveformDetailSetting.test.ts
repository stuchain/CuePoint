import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WAVEFORM_DETAIL_DEFAULT,
  SHORT_WINDOW_QUERY,
  WAVEFORM_DETAIL_SPAN_STORAGE_KEY,
  WAVEFORM_DETAIL_STORAGE_KEY,
  loadWaveformDetail,
  loadWaveformDetailSpan,
  parseWaveformDetail,
  parseWaveformDetailSpan,
  resetWaveformDetailForTests,
  resetWaveformDetailSpanForTests,
  saveWaveformDetail,
  saveWaveformDetailSpan,
  useWaveformDetailSetting,
  useWaveformDetailSpan,
} from "./waveformDetailSetting";
import { DETAIL_SPAN_MS } from "./waveformDetailLayout";
import { COMPACT_BAR_QUERY } from "../player/useCompactBar";

/** The zoomed waveform is on until switched off, remembered under one key (T4). */
beforeEach(() => {
  localStorage.clear();
  resetWaveformDetailForTests();
  resetWaveformDetailSpanForTests();
});

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
  vi.restoreAllMocks();
  localStorage.clear();
  resetWaveformDetailForTests();
  resetWaveformDetailSpanForTests();
});

describe("the zoomed waveform setting", () => {
  it("is on until chosen otherwise", () => {
    expect(WAVEFORM_DETAIL_DEFAULT).toBe(true);
    expect(loadWaveformDetail()).toBe(true);
  });

  it("reads anything unrecognised as no choice", () => {
    expect(parseWaveformDetail("off")).toBe(false);
    expect(parseWaveformDetail("on")).toBe(true);
    expect(parseWaveformDetail("maybe")).toBeNull();
    expect(parseWaveformDetail(null)).toBeNull();
  });

  it("is remembered", () => {
    saveWaveformDetail(false);
    expect(localStorage.getItem(WAVEFORM_DETAIL_STORAGE_KEY)).toBe("off");
    resetWaveformDetailForTests();
    expect(loadWaveformDetail()).toBe(false);
  });

  it("is still applied when storage refuses", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useWaveformDetailSetting());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });

  it("changes every view at once", () => {
    const a = renderHook(() => useWaveformDetailSetting());
    const b = renderHook(() => useWaveformDetailSetting());
    act(() => a.result.current[1](false));
    expect(b.result.current[0]).toBe(false);
  });

  it("follows another window", () => {
    const { result } = renderHook(() => useWaveformDetailSetting());
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: WAVEFORM_DETAIL_STORAGE_KEY, newValue: "off" }));
    });
    expect(result.current[0]).toBe(false);
  });
});

/** A window that starts without the strip when short, until the user chooses (R2-2). */
describe("the short-window default", () => {
  function fakeMedia(initial: boolean) {
    let matches = initial;
    const listeners = new Set<() => void>();
    const list = {
      get matches() {
        return matches;
      },
      media: SHORT_WINDOW_QUERY,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
    const matchMedia = vi.fn(() => list);
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });
    return {
      matchMedia,
      set matches(value: boolean) {
        matches = value;
      },
      resize(short: boolean) {
        matches = short;
        listeners.forEach((fn) => fn());
      },
    };
  }

  it("asks about windows under 700 px of content", () => {
    expect(SHORT_WINDOW_QUERY).toBe("(max-height: 699.98px)");
    const media = fakeMedia(true);
    loadWaveformDetail();
    loadWaveformDetail();
    expect(media.matchMedia).toHaveBeenCalledTimes(1);
    expect(media.matchMedia).toHaveBeenCalledWith(SHORT_WINDOW_QUERY);
  });

  // N2: moved. The threshold no longer scales with the size (it was 700 x 1.5 = 1,050 px at the
  // default size, so a default 1280x800 window had no strip); it is the compact bar's real 700 px.
  it("asks the compact bar's own question at every size, so a default window keeps the strip at 1.5x", async () => {
    expect(SHORT_WINDOW_QUERY).toBe(COMPACT_BAR_QUERY);
    const media = fakeMedia(false);
    const { result } = renderHook(() => useWaveformDetailSetting());
    expect(result.current[0]).toBe(true);
    try {
      await act(async () => {
        document.documentElement.dataset.scale = "1.5";
        await Promise.resolve();
      });
      expect(media.matchMedia).toHaveBeenCalledTimes(1);
      expect(media.matchMedia).toHaveBeenLastCalledWith("(max-height: 699.98px)");
      expect(result.current[0]).toBe(true);
    } finally {
      delete document.documentElement.dataset.scale;
    }
  });

  it("is off with no choice in a short window, and on in a tall one", () => {
    fakeMedia(true);
    expect(renderHook(() => useWaveformDetailSetting()).result.current[0]).toBe(false);
    resetWaveformDetailForTests();
    fakeMedia(false);
    expect(renderHook(() => useWaveformDetailSetting()).result.current[0]).toBe(true);
  });

  it("flips as the window is resized, while nothing is chosen", () => {
    const media = fakeMedia(true);
    const { result } = renderHook(() => useWaveformDetailSetting());
    expect(result.current[0]).toBe(false);
    act(() => media.resize(false));
    expect(result.current[0]).toBe(true);
    act(() => media.resize(true));
    expect(result.current[0]).toBe(false);
  });

  it("lets an explicit choice win either way", () => {
    const media = fakeMedia(true);
    const { result } = renderHook(() => useWaveformDetailSetting());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(WAVEFORM_DETAIL_STORAGE_KEY)).toBe("on");
    act(() => media.resize(false));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    act(() => media.resize(true));
    expect(result.current[0]).toBe(false);
  });

  it("keeps an old stored off in a tall window off", () => {
    fakeMedia(false);
    localStorage.setItem(WAVEFORM_DETAIL_STORAGE_KEY, "off");
    expect(renderHook(() => useWaveformDetailSetting()).result.current[0]).toBe(false);
  });

  it("ignores resizes once chosen, tall to short to tall", () => {
    const media = fakeMedia(false);
    const { result } = renderHook(() => useWaveformDetailSetting());
    act(() => result.current[1](false));
    act(() => media.resize(true));
    act(() => media.resize(false));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    act(() => media.resize(true));
    act(() => media.resize(false));
    expect(result.current[0]).toBe(true);
  });

  it("goes back to following the window when the stored choice is removed or cleared", () => {
    const media = fakeMedia(true);
    const { result } = renderHook(() => useWaveformDetailSetting());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: WAVEFORM_DETAIL_STORAGE_KEY, newValue: null }));
    });
    expect(result.current[0]).toBe(false);
    act(() => media.resize(false));
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    localStorage.clear();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(result.current[0]).toBe(true);
  });

  it("keeps an old stored value working", () => {
    fakeMedia(true);
    localStorage.setItem(WAVEFORM_DETAIL_STORAGE_KEY, "on");
    expect(renderHook(() => useWaveformDetailSetting()).result.current[0]).toBe(true);
  });

  it("treats a platform without matchMedia as tall", () => {
    expect(window.matchMedia).toBeUndefined();
    expect(loadWaveformDetail()).toBe(true);
  });
});

describe("the zoomed waveform span", () => {
  it("is 16 s until chosen otherwise, under its own key", () => {
    expect(WAVEFORM_DETAIL_SPAN_STORAGE_KEY).toBe("cuepoint-waveform-detail-span");
    expect(loadWaveformDetailSpan()).toBe(16_000);
  });

  it("reads one of the stops, and anything else as the default", () => {
    expect(parseWaveformDetailSpan("4000")).toBe(4_000);
    expect(parseWaveformDetailSpan("64000")).toBe(64_000);
    expect(parseWaveformDetailSpan("5000")).toBe(DETAIL_SPAN_MS);
    expect(parseWaveformDetailSpan("16 s")).toBe(DETAIL_SPAN_MS);
    expect(parseWaveformDetailSpan("")).toBe(DETAIL_SPAN_MS);
    expect(parseWaveformDetailSpan(null)).toBe(DETAIL_SPAN_MS);
  });

  it("is remembered", () => {
    saveWaveformDetailSpan(32_000);
    expect(localStorage.getItem(WAVEFORM_DETAIL_SPAN_STORAGE_KEY)).toBe("32000");
    resetWaveformDetailSpanForTests();
    expect(loadWaveformDetailSpan()).toBe(32_000);
  });

  it("is still applied when storage refuses", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useWaveformDetailSpan());
    expect(result.current[0]).toBe(16_000);
    act(() => result.current[1](8_000));
    expect(result.current[0]).toBe(8_000);
  });

  it("changes every view at once and follows another window", () => {
    const a = renderHook(() => useWaveformDetailSpan());
    const b = renderHook(() => useWaveformDetailSpan());
    act(() => a.result.current[1](48_000));
    expect(b.result.current[0]).toBe(48_000);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: WAVEFORM_DETAIL_SPAN_STORAGE_KEY, newValue: "6000" }),
      );
    });
    expect(a.result.current[0]).toBe(6_000);
  });

  it("does not disturb the on/off setting", () => {
    saveWaveformDetailSpan(4_000);
    expect(loadWaveformDetail()).toBe(true);
  });
});
