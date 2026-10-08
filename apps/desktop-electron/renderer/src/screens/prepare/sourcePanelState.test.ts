/**
 * What the Prepare page remembers about its source panel, lanes (PREP-11) and
 * transition strip (WAVE-07).
 * A value that cannot be read is the default, and storage that refuses is not
 * the page's problem.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LANES_OPEN,
  DEFAULT_SOURCE_TAB,
  DEFAULT_TRANSITION_OPEN,
  LANES_STORAGE_KEY,
  SOURCE_POOL_STORAGE_KEY,
  SOURCE_TAB_STORAGE_KEY,
  SUGGESTIONS_NOTE_STORAGE_KEY,
  TRANSITION_STORAGE_KEY,
  hasSeenSuggestionsNote,
  loadLanesOpen,
  loadSourcePool,
  loadSourceTab,
  loadTransitionOpen,
  saveLanesOpen,
  saveSeenSuggestionsNote,
  saveSourcePool,
  saveSourceTab,
  saveTransitionOpen,
} from "./sourcePanelState";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the remembered source panel", () => {
  it("opens on Suggestions with the library, the lanes hidden, when nothing is remembered", () => {
    expect(loadSourceTab()).toBe(DEFAULT_SOURCE_TAB);
    expect(DEFAULT_SOURCE_TAB).toBe("suggestions");
    expect(loadSourcePool()).toBe("library");
    expect(loadLanesOpen()).toBe(DEFAULT_LANES_OPEN);
    expect(DEFAULT_LANES_OPEN).toBe(false);
    expect(loadTransitionOpen()).toBe(DEFAULT_TRANSITION_OPEN);
    expect(DEFAULT_TRANSITION_OPEN).toBe(false);
  });

  it("gives back what was saved", () => {
    saveSourceTab("library");
    saveSourcePool("smart:4");
    saveLanesOpen(true);
    expect([loadSourceTab(), loadSourcePool(), loadLanesOpen()]).toEqual(["library", "smart:4", true]);
    saveLanesOpen(false);
    expect(loadLanesOpen()).toBe(false);
    saveTransitionOpen(true);
    expect([loadTransitionOpen(), loadLanesOpen()]).toEqual([true, false]);
    saveTransitionOpen(false);
    expect(loadTransitionOpen()).toBe(false);
  });

  it("reads anything else as the default", () => {
    localStorage.setItem(SOURCE_TAB_STORAGE_KEY, "wantlist");
    localStorage.setItem(SOURCE_POOL_STORAGE_KEY, "folder:1");
    localStorage.setItem(LANES_STORAGE_KEY, "yes");
    localStorage.setItem(TRANSITION_STORAGE_KEY, "true");
    expect(loadSourceTab()).toBe("suggestions");
    expect(loadSourcePool()).toBe("library");
    expect(loadLanesOpen()).toBe(false);
    expect(loadTransitionOpen()).toBe(false);
    for (const pool of ["playlist:12", "collection:3", "library"]) {
      localStorage.setItem(SOURCE_POOL_STORAGE_KEY, pool);
      expect(loadSourcePool()).toBe(pool);
    }
  });

  it("remembers that the ranking note was shown", () => {
    expect(hasSeenSuggestionsNote()).toBe(false);
    saveSeenSuggestionsNote();
    expect(localStorage.getItem(SUGGESTIONS_NOTE_STORAGE_KEY)).toBe("1");
    expect(hasSeenSuggestionsNote()).toBe(true);
  });

  it("survives storage that refuses to read or write", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => saveSourceTab("library")).not.toThrow();
    expect(() => saveSourcePool("collection:3")).not.toThrow();
    expect(() => saveLanesOpen(true)).not.toThrow();
    expect(() => saveTransitionOpen(true)).not.toThrow();
    expect(() => saveSeenSuggestionsNote()).not.toThrow();
    expect(hasSeenSuggestionsNote()).toBe(false);
    expect([loadSourceTab(), loadSourcePool(), loadLanesOpen(), loadTransitionOpen()]).toEqual([
      "suggestions",
      "library",
      false,
      false,
    ]);
  });
});
