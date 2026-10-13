import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SCALE,
  MIN_ROWS_HEIGHT,
  SCALE_OPTIONS,
  getStoredScale,
  hasStoredScale,
  initScale,
  scaleChoices,
  scaleOptionLabel,
  suggestedScale,
} from "./scale";

const ONBOARDING_KEY = "cuepoint-onboarding-complete";

const KEY = "cuepoint-ui-lab-scale";

afterEach(() => localStorage.clear());

describe("the stored scale", () => {
  it("offers 1, 1.25, 1.5, 2 and 3, and opens at 1.5", () => {
    expect([...SCALE_OPTIONS]).toEqual([1, 1.25, 1.5, 2, 3]);
    expect(scaleOptionLabel(1.25)).toBe("Compact (1.25×)");
    expect(DEFAULT_SCALE).toBe(1.5);
  });

  it("is 1.5 with nothing stored", () => {
    expect(getStoredScale()).toBe(1.5);
  });

  it("reads a stored 1.5 as 1.5, not 1", () => {
    localStorage.setItem(KEY, "1.5");
    expect(getStoredScale()).toBe(1.5);
  });

  it.each(["1", "1.25", "2", "3"])("keeps a stored %s", (value) => {
    localStorage.setItem(KEY, value);
    expect(getStoredScale()).toBe(Number(value));
  });

  it.each(["2.5", "abc", "", "0", "-1"])("reads %j as the default", (value) => {
    localStorage.setItem(KEY, value);
    expect(getStoredScale()).toBe(1.5);
  });
});

describe("whether a size was ever chosen (DEC-207)", () => {
  it("is false with nothing stored, and true once a size is stored", () => {
    expect(hasStoredScale()).toBe(false);
    localStorage.setItem(KEY, "2");
    expect(hasStoredScale()).toBe(true);
  });

  it("counts a stored 1.5 as chosen: it was picked, not left alone", () => {
    localStorage.setItem(KEY, "1.5");
    expect(hasStoredScale()).toBe(true);
  });

  it("is false when storage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(hasStoredScale()).toBe(false);
    spy.mockRestore();
  });
});

describe("the size suggested for a screen (R2-5)", () => {
  it.each([
    [600, 1],
    [680, 1],
    [700, 1.25],
    [859, 1.25],
    [860, 1.5],
    [1040, 1.5],
  ])("suggests for an available height of %i: %s", (height, expected) => {
    expect(suggestedScale(height)).toBe(expected);
  });
});

describe("a size too big for the screen", () => {
  it("disables a size whose 1x height is under the floor, never the current one", () => {
    expect(MIN_ROWS_HEIGHT).toBe(560);
    // 720 / 1.5 = 480 < 560; 720 / 1.25 = 576 is fine.
    const choices = scaleChoices(1.25, 720);
    expect(choices.filter((c) => c.disabled).map((c) => c.value)).toEqual([1.5, 2, 3]);
    // The current size stays on offer, even when it is too big.
    const current = scaleChoices(2, 720);
    expect(current.find((c) => c.value === 2)!.disabled).toBe(false);
    expect(current.find((c) => c.value === 3)!.disabled).toBe(true);
  });

  it("disables nothing when the screen height is unknown", () => {
    expect(scaleChoices(1.5, 0).some((c) => c.disabled)).toBe(false);
  });

  it("never marks a disabled option as suggested", () => {
    for (const height of [400, 560, 680, 700, 768, 860, 1080]) {
      for (const current of [1, 1.25, 1.5, 2, 3]) {
        const choices = scaleChoices(current, height);
        expect(choices.filter((c) => c.suggested && c.disabled)).toEqual([]);
      }
    }
    expect(scaleChoices(1.5, 680).find((c) => c.suggested)!.value).toBe(1);
  });

  it("marks exactly one option as suggested for this screen", () => {
    expect(scaleChoices(1.5, 768).filter((c) => c.suggested).map((c) => c.value)).toEqual([1.25]);
    expect(scaleChoices(1.5, 1080).filter((c) => c.suggested).map((c) => c.value)).toEqual([1.5]);
    expect(scaleChoices(1.5, 0).some((c) => c.suggested)).toBe(false);
  });
});

describe("the first-run size (R2-5, Q1 a)", () => {
  function screenHeight(height: number) {
    Object.defineProperty(window.screen, "availHeight", { value: height, configurable: true });
  }
  afterEach(() => screenHeight(0));

  it("applies the suggested size and stores it on a fresh install", () => {
    screenHeight(768);
    expect(initScale()).toBe(1.25);
    expect(localStorage.getItem(KEY)).toBe("1.25");
    expect(document.documentElement.dataset.scale).toBe("1.25");
  });

  it("suggests 1.5 on a tall screen, and stores it", () => {
    screenHeight(1080);
    expect(initScale()).toBe(1.5);
    expect(localStorage.getItem(KEY)).toBe("1.5");
  });

  it("leaves an updater alone: guide finished, nothing stored, 1.5 and nothing written", () => {
    screenHeight(768);
    localStorage.setItem(ONBOARDING_KEY, "1");
    expect(initScale()).toBe(1.5);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps a stored size on a fresh install", () => {
    screenHeight(768);
    localStorage.setItem(KEY, "2");
    expect(initScale()).toBe(2);
    expect(localStorage.getItem(KEY)).toBe("2");
  });

  it("keeps 1.5 when the screen height is unknown", () => {
    expect(initScale()).toBe(1.5);
  });

  it("is 1.5 when storage throws", () => {
    screenHeight(768);
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(initScale()).toBe(1.5);
    spy.mockRestore();
  });
});
