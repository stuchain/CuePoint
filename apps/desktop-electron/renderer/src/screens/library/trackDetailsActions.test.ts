import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { availableQueueActions, cleanTracksOf, runQueueAction } from "./trackDetailsActions";

describe("the selection as Fix values takes it (INS-11)", () => {
  it("passes ids as ids", () => {
    expect(cleanTracksOf({ track_ids: [3, 4] }, 2)).toEqual({ ids: [3, 4] });
    expect(cleanTracksOf({ track_ids: [] }, 0)).toBeNull();
  });

  it("passes a described selection with the count it had", () => {
    expect(cleanTracksOf({ query: { q: "house" } }, 40)).toEqual({ query: { q: "house" }, count: 40 });
  });

  it("does not offer a described selection with exceptions, which would edit too many", () => {
    expect(cleanTracksOf({ query: {}, exclude_track_ids: [9] }, 39)).toBeNull();
  });
});

describe("the buttons under a track's title (FLW-9)", () => {
  const row = { id: 1, title: "A", artist: "B", file_path: "/a.mp3" } as LibraryTrackRow;

  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  });

  it("offers only what the player can do", () => {
    (window as unknown as { cuepoint: unknown }).cuepoint = { player: { addToQueue: vi.fn() } };
    expect(availableQueueActions()).toEqual({ play: false, next: false, end: true });
  });

  it("says what a queue action did, and a refused play in the player's words", async () => {
    const player = {
      playQueue: vi.fn().mockResolvedValue({ ok: false, error: "The player is not ready" }),
      playNext: vi.fn().mockResolvedValue(undefined),
      addToQueue: vi.fn().mockResolvedValue(undefined),
    };
    (window as unknown as { cuepoint: unknown }).cuepoint = { player };
    expect(await runQueueAction("play", [row])).toEqual({ message: "The player is not ready", failed: true });
    expect(await runQueueAction("next", [row, row])).toEqual({ message: "2 tracks queued to play next", failed: false });
    expect(await runQueueAction("end", [row])).toEqual({ message: "1 track added to the queue", failed: false });
  });
});
