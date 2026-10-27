import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { availableQueueActions, runQueueAction } from "./trackDetailsActions";

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

  it("says a rejected player call could not be done instead of rejecting (M383)", async () => {
    const player = {
      playQueue: vi.fn().mockRejectedValue(new Error("gone")),
      playNext: vi.fn().mockRejectedValue(new Error("gone")),
      addToQueue: vi.fn().mockRejectedValue(new Error("gone")),
    };
    (window as unknown as { cuepoint: unknown }).cuepoint = { player };
    expect(await runQueueAction("play", [row])).toEqual({ message: "Could not play those tracks.", failed: true });
    expect(await runQueueAction("next", [row])).toEqual({
      message: "Could not queue those tracks to play next.",
      failed: true,
    });
    expect(await runQueueAction("end", [row])).toEqual({
      message: "Could not add those tracks to the queue.",
      failed: true,
    });
  });
});
