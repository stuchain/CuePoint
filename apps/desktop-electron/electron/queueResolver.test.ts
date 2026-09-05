import { describe, expect, it } from "vitest";

import type { LibraryBrowseParams, LibrarySearchResponse } from "./engineClient";
import {
  QUEUE_MAX_TRACKS,
  QUEUE_PAGE_SIZE,
  queueTruncationMessage,
  resolveQueueFromView,
} from "./queueResolver";

/**
 * Resolving a view into a queue (PLAYER-05).
 *
 * The engine is faked with a list of rows, so what is under test is the paging:
 * that the pages join up into exactly the view's order with nothing repeated or
 * skipped, that the request count stays bounded, that the query is passed
 * through untouched, and that a view too large to queue is cut short *and says
 * so* rather than quietly doing less than it was asked.
 */

interface FakeEngine {
  browse: (params: LibraryBrowseParams) => Promise<LibrarySearchResponse>;
  calls: LibraryBrowseParams[];
}

/** An engine holding `count` tracks, answering pages of the requested size. */
function fakeEngine(count: number, options: { totalOverride?: number } = {}): FakeEngine {
  const calls: LibraryBrowseParams[] = [];
  const rows = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: `Track ${index + 1}`,
    artist: `Artist ${index + 1}`,
    key: "8A",
    bpm: 128,
    duration_seconds: 100 + index,
    file_path: `/music/${index + 1}.flac`,
  }));

  return {
    calls,
    browse: async (params) => {
      calls.push(params);
      const offset = params.offset ?? 0;
      const limit = params.limit ?? 100;
      return {
        query: params.q ?? "",
        total: options.totalOverride ?? count,
        limit,
        offset,
        tracks: [],
        library_empty: count === 0,
        queue_tracks: rows.slice(offset, offset + limit),
      } as LibrarySearchResponse;
    },
  };
}

describe("resolving a whole view", () => {
  it("returns every track in the view", async () => {
    const engine = fakeEngine(5);
    const resolved = await resolveQueueFromView(engine.browse, {}, { pageSize: 2 });
    expect(resolved.items).toHaveLength(5);
  });

  it("keeps the view's order across page boundaries", async () => {
    // The failure this guards against is silent: a queue that plays tracks in
    // a different order from the table it came from.
    const engine = fakeEngine(10);
    const resolved = await resolveQueueFromView(engine.browse, {}, { pageSize: 3 });
    expect(resolved.items.map((item) => item.trackId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("repeats and skips nothing", async () => {
    const engine = fakeEngine(100);
    const resolved = await resolveQueueFromView(engine.browse, {}, { pageSize: 7 });
    const ids = resolved.items.map((item) => item.trackId);
    expect(new Set(ids).size).toBe(100);
  });

  it("carries what the player and the panel need", async () => {
    const engine = fakeEngine(1);
    const resolved = await resolveQueueFromView(engine.browse, {});
    expect(resolved.items[0]).toEqual({
      trackId: 1,
      filePath: "/music/1.flac",
      title: "Track 1",
      artist: "Artist 1",
      key: "8A",
      bpm: 128,
      durationSeconds: 100,
    });
  });

  it("reports the view's real size", async () => {
    const engine = fakeEngine(42);
    const resolved = await resolveQueueFromView(engine.browse, {}, { pageSize: 10 });
    expect(resolved.total).toBe(42);
    expect(resolved.truncated).toBe(false);
  });

  it("handles an empty view without a second request", async () => {
    const engine = fakeEngine(0);
    const resolved = await resolveQueueFromView(engine.browse, {});
    expect(resolved.items).toEqual([]);
    expect(engine.calls).toHaveLength(1);
  });

  it("handles a view that fits in one page", async () => {
    const engine = fakeEngine(3);
    const resolved = await resolveQueueFromView(engine.browse, {}, { pageSize: 100 });
    expect(resolved.items).toHaveLength(3);
    expect(engine.calls).toHaveLength(1);
  });
});

describe("the query it asks", () => {
  it("asks for the queue projection", async () => {
    const engine = fakeEngine(1);
    await resolveQueueFromView(engine.browse, {});
    expect(engine.calls[0].fields).toBe("queue");
  });

  it("passes the view through untouched", async () => {
    // Scope, text, filters and ordering are what make the queue match the
    // table; changing any of them here would silently queue something else.
    const engine = fakeEngine(1);
    const view: LibraryBrowseParams = {
      q: "deadmau5",
      playlistId: 7,
      sort: "bpm",
      dir: "desc",
      filters: { match: "all", rules: [{ field: "genre", operator: "is", value: "House" }] },
    } as LibraryBrowseParams;

    await resolveQueueFromView(engine.browse, view);

    expect(engine.calls[0]).toMatchObject({
      q: "deadmau5",
      playlistId: 7,
      sort: "bpm",
      dir: "desc",
      filters: view.filters,
    });
  });

  it("walks offsets in step with what it has collected", async () => {
    const engine = fakeEngine(10);
    await resolveQueueFromView(engine.browse, {}, { pageSize: 4 });
    expect(engine.calls.map((call) => call.offset)).toEqual([0, 4, 8]);
  });
});

describe("bounded work", () => {
  it("issues a bounded number of requests for a large view", async () => {
    const engine = fakeEngine(20_000);
    const resolved = await resolveQueueFromView(engine.browse, {}, { pageSize: 2_000 });
    expect(resolved.requests).toBe(10);
  });

  it("does not ask for more than the cap even for a huge view", async () => {
    const engine = fakeEngine(30_000);
    const resolved = await resolveQueueFromView(
      engine.browse,
      {},
      { pageSize: 1_000, maxTracks: 5_000 },
    );
    expect(resolved.items).toHaveLength(5_000);
    expect(resolved.requests).toBe(5);
  });

  it("never asks for a page larger than what is left under the cap", async () => {
    const engine = fakeEngine(1_000);
    await resolveQueueFromView(engine.browse, {}, { pageSize: 400, maxTracks: 500 });
    expect(engine.calls.map((call) => call.limit)).toEqual([400, 100]);
  });

  it("the shipped defaults resolve the largest library in a sane number of requests", () => {
    expect(Math.ceil(QUEUE_MAX_TRACKS / QUEUE_PAGE_SIZE)).toBeLessThanOrEqual(25);
  });
});

describe("a view too large to queue", () => {
  it("cuts the queue at the cap", async () => {
    const engine = fakeEngine(10_000);
    const resolved = await resolveQueueFromView(
      engine.browse,
      {},
      { pageSize: 500, maxTracks: 1_000 },
    );
    expect(resolved.items).toHaveLength(1_000);
  });

  it("says it was truncated rather than pretending otherwise", async () => {
    const engine = fakeEngine(10_000);
    const resolved = await resolveQueueFromView(
      engine.browse,
      {},
      { pageSize: 500, maxTracks: 1_000 },
    );
    expect(resolved.truncated).toBe(true);
    expect(resolved.total).toBe(10_000);
  });

  it("produces a message naming both numbers", async () => {
    const engine = fakeEngine(10_000);
    const resolved = await resolveQueueFromView(
      engine.browse,
      {},
      { pageSize: 500, maxTracks: 1_000 },
    );
    const message = queueTruncationMessage(resolved);
    expect(message).toContain("1,000");
    expect(message).toContain("10,000");
  });

  it("says nothing when the whole view fits", async () => {
    const engine = fakeEngine(5);
    const resolved = await resolveQueueFromView(engine.browse, {});
    expect(queueTruncationMessage(resolved)).toBeNull();
  });
});

describe("an engine that disagrees with itself", () => {
  it("stops on a short page rather than looping", async () => {
    // The library can change between pages. Trusting a stale `total` would
    // keep asking for rows that are not there.
    const engine = fakeEngine(5, { totalOverride: 500 });
    const resolved = await resolveQueueFromView(engine.browse, {}, { pageSize: 2 });
    expect(resolved.items).toHaveLength(5);
    expect(resolved.requests).toBeLessThanOrEqual(4);
  });

  it("stops when a page comes back empty", async () => {
    const engine = fakeEngine(0, { totalOverride: 100 });
    const resolved = await resolveQueueFromView(engine.browse, {}, { pageSize: 10 });
    expect(resolved.items).toEqual([]);
    expect(resolved.requests).toBe(1);
  });

  it("survives a response with no queue rows at all", async () => {
    const browse = async () =>
      ({ query: "", total: 0, limit: 0, offset: 0, tracks: [], library_empty: true }) as
        LibrarySearchResponse;
    const resolved = await resolveQueueFromView(browse, {});
    expect(resolved.items).toEqual([]);
  });
});
