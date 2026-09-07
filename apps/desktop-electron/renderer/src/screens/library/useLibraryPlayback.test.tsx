/**
 * Playing from the Library (PLAYER-09, DEC-012, DEC-013).
 *
 * The distinction these tests exist to protect is what each action means by
 * "the queue". Play on a row queues the *view* — the query, not the rows the
 * table happens to hold — and getting that wrong is invisible on a three-row
 * fixture and wrong on a fifty-thousand-track library. Play Next and Add to
 * Queue must never replace anything, which is the other easy mistake.
 */
import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { DEFAULT_LIBRARY_QUERY, type LibraryQuery } from "./libraryQuery";
import { queuedMessage, toQueueItem, useLibraryPlayback } from "./useLibraryPlayback";

function row(id: number, overrides: Partial<LibraryTrackRow> = {}): LibraryTrackRow {
  return {
    id,
    title: `Track ${id}`,
    artist: "Artist",
    album: null,
    genre: null,
    bpm: 128,
    key: "8A",
    rating: null,
    duration_seconds: 300,
    year: null,
    label: null,
    play_count: null,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: null,
    file_path: `C:\\music\\${id}.mp3`,
    ...overrides,
  } as LibraryTrackRow;
}

function install(overrides: Record<string, unknown> = {}) {
  const player = {
    playView: vi.fn().mockResolvedValue({ ok: true }),
    playQueue: vi.fn().mockResolvedValue({ ok: true }),
    playNext: vi.fn().mockResolvedValue(undefined),
    addToQueue: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = { player };
  return player;
}

function mount(query: LibraryQuery = DEFAULT_LIBRARY_QUERY) {
  const onMessage = vi.fn();
  const hook = renderHook(() => useLibraryPlayback({ query, onMessage }));
  return { ...hook, onMessage };
}

afterEach(() => {
  delete (window as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("playing a row (DEC-012)", () => {
  it("queues the view, not the loaded rows", async () => {
    const player = install();
    const query: LibraryQuery = {
      ...DEFAULT_LIBRARY_QUERY,
      q: "acid",
      playlistId: 7,
      sort: "bpm",
      dir: "desc",
    };
    const { result } = mount(query);

    await act(() => result.current.playRow(41));

    // Offset 0 and limit 0: the whole answer to this question, which is what
    // main resolves into a queue (PLAYER-05). A limit borrowed from the table's
    // window would queue a hundred tracks out of fifty thousand.
    expect(player.playView).toHaveBeenCalledWith(
      {
        q: "acid",
        playlistId: 7,
        sort: "bpm",
        dir: "desc",
        filters: null,
        limit: 0,
        offset: 0,
        // ORG-09's scope travels with the view, so a queue built inside a
        // Collection is that Collection in the order it is arranged.
        scope: undefined,
        collectionId: null,
      },
      41,
    );
  });

  it("reports a refusal instead of failing silently", async () => {
    install({ playView: vi.fn().mockResolvedValue({ ok: false, error: "No player" }) });
    const { result, onMessage } = mount();

    await act(() => result.current.playRow(0));

    expect(onMessage).toHaveBeenCalledWith("No player");
  });

  it("passes on a truncation notice but says nothing when there is none", async () => {
    const player = install({
      playView: vi.fn().mockResolvedValue({ ok: true, message: "Queued the first 50,000 tracks" }),
    });
    const { result, onMessage } = mount();

    await act(() => result.current.playRow(0));
    expect(onMessage).toHaveBeenCalledWith("Queued the first 50,000 tracks");

    onMessage.mockClear();
    player.playView.mockResolvedValue({ ok: true });
    await act(() => result.current.playRow(0));
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("does nothing at all without a player", async () => {
    const { result, onMessage } = mount();

    await act(() => result.current.playRow(0));

    expect(onMessage).not.toHaveBeenCalled();
    expect(result.current.available).toBe(false);
  });
});

describe("playing a selection", () => {
  it("replaces the queue with the rows, in the order given", async () => {
    const player = install();
    const { result } = mount();

    await act(() => result.current.playRows([row(3), row(1)]));

    expect(player.playQueue).toHaveBeenCalledWith(
      [toQueueItem(row(3)), toQueueItem(row(1))],
      0,
    );
    // Never the view: a selection *is* the queue.
    expect(player.playView).not.toHaveBeenCalled();
  });

  it("ignores an empty selection", async () => {
    const player = install();
    const { result } = mount();

    await act(() => result.current.playRows([]));

    expect(player.playQueue).not.toHaveBeenCalled();
  });
});

describe("queueing without interrupting (DEC-013)", () => {
  it("inserts after the current track and says so", async () => {
    const player = install();
    const { result, onMessage } = mount();

    await act(() => result.current.playNext([row(1), row(2)]));

    expect(player.playNext).toHaveBeenCalledWith([toQueueItem(row(1)), toQueueItem(row(2))]);
    expect(onMessage).toHaveBeenCalledWith("2 tracks queued to play next");
    // Neither of these would leave the current track alone.
    expect(player.playQueue).not.toHaveBeenCalled();
    expect(player.playView).not.toHaveBeenCalled();
  });

  it("appends and says so", async () => {
    const player = install();
    const { result, onMessage } = mount();

    await act(() => result.current.addToQueue([row(9)]));

    expect(player.addToQueue).toHaveBeenCalledWith([toQueueItem(row(9))]);
    expect(onMessage).toHaveBeenCalledWith("1 track added to the queue");
    expect(player.playQueue).not.toHaveBeenCalled();
  });
});

describe("the queue item a row becomes", () => {
  it("carries what the bar and panel show", () => {
    expect(toQueueItem(row(5))).toEqual({
      trackId: 5,
      filePath: "C:\\music\\5.mp3",
      title: "Track 5",
      artist: "Artist",
      key: "8A",
      bpm: 128,
      durationSeconds: 300,
    });
  });

  it("turns missing fields into nulls rather than undefined", () => {
    // They cross an IPC boundary: `undefined` disappears on the way and the
    // difference between "no key" and "field absent" is lost.
    const bare = toQueueItem(row(6, { id: null, key: null, bpm: null, duration_seconds: null }));
    expect(bare).toEqual({
      trackId: null,
      filePath: "C:\\music\\6.mp3",
      title: "Track 6",
      artist: "Artist",
      key: null,
      bpm: null,
      durationSeconds: null,
    });
    expect(Object.values(bare).every((value) => value !== undefined)).toBe(true);
  });
});

describe("what an append says", () => {
  it("counts and places", () => {
    expect(queuedMessage(1, "next")).toBe("1 track queued to play next");
    expect(queuedMessage(1200, "end")).toBe("1,200 tracks added to the queue");
  });
});
