import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WAVEFORM_DETAIL_DEFAULT,
  WAVEFORM_DETAIL_STORAGE_KEY,
  loadWaveformDetail,
  parseWaveformDetail,
  resetWaveformDetailForTests,
  saveWaveformDetail,
  useWaveformDetailSetting,
} from "./waveformDetailSetting";

/** The zoomed waveform is on until switched off, remembered under one key (T4). */
beforeEach(() => {
  localStorage.clear();
  resetWaveformDetailForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetWaveformDetailForTests();
});

describe("the zoomed waveform setting", () => {
  it("is on until chosen otherwise", () => {
    expect(WAVEFORM_DETAIL_DEFAULT).toBe(true);
    expect(loadWaveformDetail()).toBe(true);
  });

  it("reads anything unrecognised as the default", () => {
    expect(parseWaveformDetail("off")).toBe(false);
    expect(parseWaveformDetail("on")).toBe(true);
    expect(parseWaveformDetail("maybe")).toBe(true);
    expect(parseWaveformDetail(null)).toBe(true);
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
