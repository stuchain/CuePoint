import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WAVEFORM_COLOUR_DEFAULT,
  WAVEFORM_COLOUR_OPTIONS,
  WAVEFORM_COLOUR_STORAGE_KEY,
  loadWaveformColour,
  parseWaveformColour,
  resetWaveformColourForTests,
  saveWaveformColour,
  useWaveformColour,
} from "./waveformColour";

/**
 * "Three bands" or "One colour" (WAVE-05): remembered under one key, read
 * through one hook, and never broken by storage that refuses.
 */
beforeEach(() => {
  localStorage.clear();
  resetWaveformColourForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetWaveformColourForTests();
});

describe("the waveform colour preference", () => {
  it("is three bands until chosen otherwise", () => {
    expect(WAVEFORM_COLOUR_DEFAULT).toBe("bands");
    expect(loadWaveformColour()).toBe("bands");
    expect(WAVEFORM_COLOUR_OPTIONS.map((o) => o.label)).toEqual(["Three bands", "One color"]);
  });

  it("reads anything unrecognised as the default", () => {
    expect(parseWaveformColour("single")).toBe("single");
    expect(parseWaveformColour("bands")).toBe("bands");
    expect(parseWaveformColour("rainbow")).toBe("bands");
    expect(parseWaveformColour(null)).toBe("bands");
  });

  it("survives a reload", () => {
    saveWaveformColour("single");
    expect(localStorage.getItem(WAVEFORM_COLOUR_STORAGE_KEY)).toBe("single");

    resetWaveformColourForTests();
    const { result } = renderHook(() => useWaveformColour());

    expect(result.current[0]).toBe("single");
  });

  it("changes every reader at once", () => {
    const first = renderHook(() => useWaveformColour());
    const second = renderHook(() => useWaveformColour());

    act(() => first.result.current[1]("single"));

    expect(first.result.current[0]).toBe("single");
    expect(second.result.current[0]).toBe("single");
  });

  it("reads storage that throws as the default", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadWaveformColour()).toBe("bands");
    const { result } = renderHook(() => useWaveformColour());
    expect(result.current[0]).toBe("bands");
  });

  it("still applies a choice that storage refuses to remember", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { result } = renderHook(() => useWaveformColour());

    act(() => result.current[1]("single"));

    expect(result.current[0]).toBe("single");
  });

  it("follows a change made in another window", () => {
    const { result } = renderHook(() => useWaveformColour());

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: WAVEFORM_COLOUR_STORAGE_KEY, newValue: "single" }),
      );
    });

    expect(result.current[0]).toBe("single");
  });
});
