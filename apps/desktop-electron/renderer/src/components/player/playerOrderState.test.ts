import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PLAYER_REPEAT_STORAGE_KEY,
  PLAYER_SHUFFLE_STORAGE_KEY,
  isRepeatMode,
  loadRepeat,
  loadShuffle,
  nextRepeatMode,
  repeatLabel,
  saveRepeat,
  saveShuffle,
} from "./playerOrderState";

/**
 * Remembering shuffle and repeat (PLAYER-07).
 *
 * These are preferences rather than playback state, which is why they are
 * persisted at all: DEC-014 rules out restoring what was playing and where it
 * had got to, and says nothing about how the user likes their queue ordered.
 *
 * The awkward cases are all about *bad* stored values, because storage is not
 * something the app controls: it can be absent, stale from an older version,
 * edited by hand, or throw outright where site data is disabled.
 */

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("shuffle", () => {
  it("is off when nothing was ever stored", () => {
    expect(loadShuffle()).toBe(false);
  });

  it("survives a round trip", () => {
    saveShuffle(true);
    expect(loadShuffle()).toBe(true);
    saveShuffle(false);
    expect(loadShuffle()).toBe(false);
  });

  it("treats an unrecognised value as off", () => {
    localStorage.setItem(PLAYER_SHUFFLE_STORAGE_KEY, "yes please");
    expect(loadShuffle()).toBe(false);
  });

  it("survives storage that throws on read", () => {
    // Site data disabled: a preference is not worth an unusable app.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadShuffle()).toBe(false);
  });

  it("survives storage that throws on write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveShuffle(true)).not.toThrow();
  });
});

describe("repeat", () => {
  it("is off when nothing was ever stored", () => {
    expect(loadRepeat()).toBe("off");
  });

  it("survives a round trip for every mode", () => {
    for (const mode of ["off", "all", "one"] as const) {
      saveRepeat(mode);
      expect(loadRepeat()).toBe(mode);
    }
  });

  it("treats a value it does not recognise as off", () => {
    // A stored "repeat: sometimes" must not become a mode nothing handles.
    localStorage.setItem(PLAYER_REPEAT_STORAGE_KEY, "sometimes");
    expect(loadRepeat()).toBe("off");
  });

  it("recognises exactly the three modes", () => {
    expect(isRepeatMode("off")).toBe(true);
    expect(isRepeatMode("one")).toBe(true);
    expect(isRepeatMode("all")).toBe(true);
    expect(isRepeatMode("ONE")).toBe(false);
    expect(isRepeatMode(null)).toBe(false);
    expect(isRepeatMode(1)).toBe(false);
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadRepeat()).toBe("off");
  });
});

describe("the repeat button's cycle", () => {
  it("goes off, all, one, and back", () => {
    // Pressing once means "keep going", not "play this same track forever".
    expect(nextRepeatMode("off")).toBe("all");
    expect(nextRepeatMode("all")).toBe("one");
    expect(nextRepeatMode("one")).toBe("off");
  });

  it("returns to where it started in three presses", () => {
    let mode = nextRepeatMode("off");
    mode = nextRepeatMode(mode);
    mode = nextRepeatMode(mode);
    expect(mode).toBe("off");
  });

  it("names each state for a screen reader", () => {
    expect(repeatLabel("off")).toBe("Repeat off");
    expect(repeatLabel("all")).toBe("Repeat all");
    expect(repeatLabel("one")).toBe("Repeat one");
  });
});
