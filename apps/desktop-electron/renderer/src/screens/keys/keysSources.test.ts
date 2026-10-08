import { afterEach, describe, expect, it, vi } from "vitest";

import {
  KEYS_SOURCES_STORAGE_KEY,
  goneSource,
  keepExisting,
  loadSources,
  requestSources,
  saveSources,
  toggleSource,
} from "./keysSources";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the ticked sources (PAGES-16)", () => {
  it("are remembered under cuepoint-keys-sources", () => {
    saveSources([{ kind: "playlist", id: 3 }]);
    expect(JSON.parse(localStorage.getItem("cuepoint-keys-sources")!)).toEqual([
      { kind: "playlist", id: 3 },
    ]);
    expect(KEYS_SOURCES_STORAGE_KEY).toBe("cuepoint-keys-sources");
    expect(loadSources()).toEqual([{ kind: "playlist", id: 3 }]);
  });

  it("start empty, which is the whole library", () => {
    expect(loadSources()).toEqual([]);
  });

  it("ignore a remembered value that is not a list of sources", () => {
    localStorage.setItem("cuepoint-keys-sources", "{not json");
    expect(loadSources()).toEqual([]);
    localStorage.setItem(
      "cuepoint-keys-sources",
      JSON.stringify([{ kind: "playlist", id: 1 }, { kind: "x", id: 2 }, 5, { kind: "set" }]),
    );
    expect(loadSources()).toEqual([{ kind: "playlist", id: 1 }]);
  });

  it("survive a store that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadSources()).toEqual([]);
    expect(() => saveSources([{ kind: "set", id: 1 }])).not.toThrow();
  });

  it("toggle one source in and out, keeping the others in the order ticked", () => {
    const a = { kind: "playlist", id: 1 } as const;
    const b = { kind: "collection", id: 1 } as const;
    expect(toggleSource([], a)).toEqual([a]);
    expect(toggleSource([a], b)).toEqual([a, b]);
    expect(toggleSource([a, b], a)).toEqual([b]);
  });

  it("tell a playlist from a Collection with the same id", () => {
    const list = toggleSource([{ kind: "playlist", id: 1 }], { kind: "collection", id: 1 });
    expect(list).toHaveLength(2);
  });

  it("drop what no longer exists", () => {
    const kept = keepExisting(
      [
        { kind: "playlist", id: 1 },
        { kind: "playlist", id: 2 },
        { kind: "set", id: 1 },
      ],
      [
        { kind: "playlist", id: 2 },
        { kind: "set", id: 1 },
      ],
    );
    expect(kept).toEqual([
      { kind: "playlist", id: 2 },
      { kind: "set", id: 1 },
    ]);
  });

  it("are asked of the engine as the whole library when none is ticked", () => {
    expect(requestSources([])).toEqual([{ kind: "all" }]);
    expect(requestSources([{ kind: "set", id: 4 }])).toEqual([{ kind: "set", id: 4 }]);
  });
});

describe("the source the engine says is gone", () => {
  it("reads the kind and id out of its message", () => {
    expect(goneSource("No playlist with id 3")).toEqual({ kind: "playlist", id: 3 });
    expect(goneSource("No set with id 12")).toEqual({ kind: "set", id: 12 });
    expect(goneSource("No collection with id 7")).toEqual({ kind: "collection", id: 7 });
    expect(goneSource("Something else")).toBeNull();
  });
});
