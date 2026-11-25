import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CROWD_SETTING_DEFAULT, CROWD_SETTING_KEY, loadCrowdSetting, resetCrowdSettingForTests, saveCrowdSetting, useCrowdSetting } from "./crowdSetting";

beforeEach(() => {
  localStorage.clear();
  resetCrowdSettingForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetCrowdSettingForTests();
});

describe("the dancing crowd setting", () => {
  it("uses its own key and is on by default", () => {
    expect(CROWD_SETTING_KEY).toBe("cuepoint-dancing-crowd");
    expect(CROWD_SETTING_DEFAULT).toBe(true);
    expect(loadCrowdSetting()).toBe(true);
    expect(renderHook(() => useCrowdSetting()).result.current[0]).toBe(true);
  });

  it("reads a stored off, and treats anything else as the default", () => {
    localStorage.setItem(CROWD_SETTING_KEY, "off");
    expect(loadCrowdSetting()).toBe(false);
    localStorage.setItem(CROWD_SETTING_KEY, "on");
    expect(loadCrowdSetting()).toBe(true);
    localStorage.setItem(CROWD_SETTING_KEY, "banana");
    expect(loadCrowdSetting()).toBe(true);
  });

  it("stores the choice and tells every reader", () => {
    const { result } = renderHook(() => useCrowdSetting());
    act(() => result.current[1](false));
    expect(localStorage.getItem(CROWD_SETTING_KEY)).toBe("off");
    expect(result.current[0]).toBe(false);
    act(() => saveCrowdSetting(true));
    expect(localStorage.getItem(CROWD_SETTING_KEY)).toBe("on");
    expect(result.current[0]).toBe(true);
  });

  it("reads storage that throws as the default, and still applies a choice for the session", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadCrowdSetting()).toBe(true);
    const { result } = renderHook(() => useCrowdSetting());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });

  it("follows a change made in another window", () => {
    const { result } = renderHook(() => useCrowdSetting());
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: CROWD_SETTING_KEY, newValue: "off" }));
    });
    expect(result.current[0]).toBe(false);
  });
});
