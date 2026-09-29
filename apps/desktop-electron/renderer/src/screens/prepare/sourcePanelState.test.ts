/**
 * What the Prepare page remembers about its source panel and lanes (PREP-11).
 * A value that cannot be read is the default, and storage that refuses is not
 * the page's problem.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LANES_OPEN,
  DEFAULT_SOURCE_TAB,
  LANES_STORAGE_KEY,
  SOURCE_POOL_STORAGE_KEY,
  SOURCE_TAB_STORAGE_KEY,
  loadLanesOpen,
  loadSourcePool,
  loadSourceTab,
  saveLanesOpen,
  saveSourcePool,
  saveSourceTab,
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
  });

  it("gives back what was saved", () => {
    saveSourceTab("library");
    saveSourcePool("smart:4");
    saveLanesOpen(true);
    expect([loadSourceTab(), loadSourcePool(), loadLanesOpen()]).toEqual(["library", "smart:4", true]);
    saveLanesOpen(false);
    expect(loadLanesOpen()).toBe(false);
  });

  it("reads anything else as the default", () => {
    localStorage.setItem(SOURCE_TAB_STORAGE_KEY, "wantlist");
    localStorage.setItem(SOURCE_POOL_STORAGE_KEY, "folder:1");
    localStorage.setItem(LANES_STORAGE_KEY, "yes");
    expect(loadSourceTab()).toBe("suggestions");
    expect(loadSourcePool()).toBe("library");
    expect(loadLanesOpen()).toBe(false);
    for (const pool of ["playlist:12", "collection:3", "library"]) {
      localStorage.setItem(SOURCE_POOL_STORAGE_KEY, pool);
      expect(loadSourcePool()).toBe(pool);
    }
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
    expect([loadSourceTab(), loadSourcePool(), loadLanesOpen()]).toEqual(["suggestions", "library", false]);
  });
});
