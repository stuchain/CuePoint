/**
 * Windowed loading (LIBUI-05, DEC-040).
 *
 * Five properties, each with a test that fails if it is undone:
 *
 * **A page is asked for once.** Dragging a scrollbar across a 50,000-row table
 * must issue a handful of requests, not hundreds of identical ones.
 * **A gap is one request, not one per page.** Contiguous pages are fetched
 * together.
 * **Memory is bounded.** Browsing end to end holds a fixed number of pages,
 * however far it goes.
 * **A stale response is dropped**, recognized by what it answers.
 * **A failure is a state that recovers**, not a table that spins forever.
 *
 * The bridge is faked because there is no engine here; nothing else is. The
 * hook under test is the real one, driven through a real render.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  FilterRuleSet,
  LibrarySearchResponse,
  LibraryTrackRow,
} from "../../api/cuepointBridge.types";
import { DEFAULT_LIBRARY_QUERY, type LibraryQuery } from "./libraryQuery";
import { MAX_PAGES, PAGE_SIZE, pagesForRange, pagesToEvict, useTrackWindow } from "./useTrackWindow";

const TOTAL = 50_000;

function row(index: number): LibraryTrackRow {
  return {
    id: index + 1,
    rekordbox_track_id: String(index + 1),
    title: `Track ${index + 1}`,
    artist: `Artist ${index % 900}`,
    remixer: null,
    album: null,
    label: null,
    genre: null,
    key: null,
    bpm: null,
    year: null,
    duration_seconds: null,
    rating: null,
    play_count: null,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: null,
    file_path: `/music/${index + 1}.mp3`,
  };
}

interface Call {
  offset: number;
  limit: number;
}

let calls: Call[];
let browseLibrary: ReturnType<typeof vi.fn>;

/** A bridge that answers with the rows a request asked for. */
function respond(params: {
  offset?: number;
  limit?: number;
  sort?: string;
  dir?: "asc" | "desc";
  playlistId?: number | null;
  q?: string;
  filters?: FilterRuleSet | null;
}): LibrarySearchResponse {
  const offset = params.offset ?? 0;
  const limit = params.limit ?? PAGE_SIZE;
  return {
    query: params.q ?? "",
    total: TOTAL,
    limit,
    offset,
    tracks: Array.from({ length: Math.min(limit, TOTAL - offset) }, (_, i) =>
      row(offset + i),
    ),
    library_empty: false,
    mode: "browse",
    scope: params.playlistId ?? null,
    sort: params.sort ?? "artist",
    dir: params.dir ?? "asc",
    filters: params.filters ?? { match: "all", rules: [] },
  };
}

beforeEach(() => {
  calls = [];
  browseLibrary = vi.fn(async (params: Call & Record<string, unknown>) => {
    calls.push({ offset: params.offset ?? 0, limit: params.limit ?? PAGE_SIZE });
    return respond(params);
  });
  (window as unknown as { cuepoint?: unknown }).cuepoint = { browseLibrary };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

function query(overrides: Partial<LibraryQuery> = {}): LibraryQuery {
  return { ...DEFAULT_LIBRARY_QUERY, ...overrides };
}

describe("the first window", () => {
  it("asks for the first page without being scrolled", async () => {
    const { result } = renderHook(() => useTrackWindow(query()));

    await waitFor(() => expect(result.current.total).toBe(TOTAL));
    expect(calls).toEqual([{ offset: 0, limit: PAGE_SIZE }]);
  });

  it("takes the total from the engine, not from the rows it holds", async () => {
    const { result } = renderHook(() => useTrackWindow(query()));

    await waitFor(() => expect(result.current.total).toBe(TOTAL));
    expect(result.current.loadedRows).toBe(PAGE_SIZE);
  });

  it("hands the table the rows it loaded", async () => {
    const { result } = renderHook(() => useTrackWindow(query()));

    await waitFor(() => expect(result.current.total).toBe(TOTAL));
    expect(result.current.source.getRow(0)?.title).toBe("Track 1");
    expect(result.current.source.getRow(99)?.title).toBe("Track 100");
  });

  it("has nothing for a row it has not loaded", async () => {
    const { result } = renderHook(() => useTrackWindow(query()));

    await waitFor(() => expect(result.current.total).toBe(TOTAL));
    expect(result.current.source.getRow(40_000)).toBeUndefined();
  });

  it("reports an empty library as empty, not as no matches", async () => {
    browseLibrary.mockResolvedValue({
      ...respond({}),
      total: 0,
      tracks: [],
      library_empty: true,
    });
    const { result } = renderHook(() => useTrackWindow(query()));

    await waitFor(() => expect(result.current.libraryEmpty).toBe(true));
    expect(result.current.total).toBe(0);
  });
});

describe("scrolling", () => {
  it("fetches the pages a range needs", async () => {
    const { result } = renderHook(() => useTrackWindow(query()));
    await waitFor(() => expect(result.current.total).toBe(TOTAL));

    act(() => result.current.source.requestWindow?.(1_000, 1_020));

    await waitFor(() =>
      expect(result.current.source.getRow(1_000)?.title).toBe("Track 1001"),
    );
  });

  it("asks once for a contiguous gap, not once per page", async () => {
    const { result } = renderHook(() => useTrackWindow(query()));
    await waitFor(() => expect(result.current.total).toBe(TOTAL));
    calls.length = 0;

    // Eight pages' worth of rows in one visible range.
    act(() => result.current.source.requestWindow?.(2_000, 2_700));
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.limit).toBeGreaterThan(PAGE_SIZE);
  });

  it("does not ask again for a page it already holds", async () => {
    const { result } = renderHook(() => useTrackWindow(query()));
    await waitFor(() => expect(result.current.total).toBe(TOTAL));

    // The margin pulls in page 1, which is a real fetch...
    act(() => result.current.source.requestWindow?.(0, 20));
    await waitFor(() => expect(result.current.source.getRow(150)).toBeDefined());
    const after = calls.length;

    // ...and asking for the same window again is not.
    act(() => result.current.source.requestWindow?.(0, 20));
    act(() => result.current.source.requestWindow?.(5, 25));

    expect(calls).toHaveLength(after);
    // Page 0 came from the first request and was never asked for twice.
    expect(calls.filter((call) => call.offset === 0)).toHaveLength(1);
  });

  it("settles after a jitter of scroll events in one place", async () => {
    // The guard a naive implementation fails: one request per scroll event.
    const { result } = renderHook(() => useTrackWindow(query()));
    await waitFor(() => expect(result.current.total).toBe(TOTAL));
    calls.length = 0;

    for (let i = 0; i < 40; i += 1) {
      act(() => result.current.source.requestWindow?.(1_000 + i, 1_040 + i));
    }
    await waitFor(() => expect(result.current.source.getRow(1_000)).toBeDefined());

    expect(calls.length).toBeLessThanOrEqual(2);
  });

  it("fetches each page at most once across a long scroll", async () => {
    // Twenty thousand rows is two hundred pages. A table that re-asked for
    // pages it had just read would fetch far more rows than it passed.
    const { result } = renderHook(() => useTrackWindow(query()));
    await waitFor(() => expect(result.current.total).toBe(TOTAL));
    calls.length = 0;

    for (let start = 0; start < 20_000; start += 200) {
      act(() => result.current.source.requestWindow?.(start, start + 40));
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(result.current.loadedRows).toBeGreaterThan(0));
    }

    const rowsFetched = calls.reduce((sum, call) => sum + call.limit, 0);
    expect(rowsFetched).toBeLessThan(26_000);
  });
});

describe("memory", () => {
  it("keeps a bounded number of pages however far it scrolls", async () => {
    const { result } = renderHook(() => useTrackWindow(query()));
    await waitFor(() => expect(result.current.total).toBe(TOTAL));

    for (let start = 0; start < 30_000; start += 500) {
      act(() => result.current.source.requestWindow?.(start, start + 40));
      // Each window has to settle, or nothing is ever evicted.
      // eslint-disable-next-line no-await-in-loop
      await waitFor(() => expect(result.current.loadedRows).toBeGreaterThan(0));
    }

    expect(result.current.loadedRows).toBeLessThanOrEqual(MAX_PAGES * PAGE_SIZE);
  });

  it("keeps the pages nearest the window", async () => {
    const { result } = renderHook(() => useTrackWindow(query()));
    await waitFor(() => expect(result.current.total).toBe(TOTAL));

    act(() => result.current.source.requestWindow?.(10_000, 10_040));
    await waitFor(() => expect(result.current.source.getRow(10_000)).toBeDefined());

    expect(result.current.source.getRow(10_000)).toBeDefined();
  });
});

describe("a query that changed", () => {
  it("throws away the rows that answered the old one", async () => {
    const { result, rerender } = renderHook(({ q }) => useTrackWindow(q), {
      initialProps: { q: query() },
    });
    await waitFor(() => expect(result.current.source.getRow(0)).toBeDefined());

    rerender({ q: query({ sort: "bpm" }) });

    expect(result.current.source.getRow(0)).toBeUndefined();
    expect(result.current.loadedRows).toBe(0);
  });

  it("asks again for the new one", async () => {
    const { result, rerender } = renderHook(({ q }) => useTrackWindow(q), {
      initialProps: { q: query() },
    });
    await waitFor(() => expect(result.current.total).toBe(TOTAL));
    calls.length = 0;

    rerender({ q: query({ sort: "bpm", dir: "desc" }) });
    await waitFor(() => expect(calls.length).toBe(1));

    expect(browseLibrary).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "bpm", dir: "desc", offset: 0 }),
    );
  });

  it("does not re-query when nothing about the question changed", async () => {
    const { result, rerender } = renderHook(({ q }) => useTrackWindow(q), {
      initialProps: { q: query() },
    });
    await waitFor(() => expect(result.current.total).toBe(TOTAL));
    calls.length = 0;

    // A new object, the same question.
    rerender({ q: query() });
    await waitFor(() => expect(result.current.total).toBe(TOTAL));

    expect(calls).toHaveLength(0);
  });
});

describe("a response that arrives late", () => {
  it("is dropped when it answers the previous sort", async () => {
    let release: ((value: LibrarySearchResponse) => void) | null = null;
    browseLibrary.mockImplementationOnce(
      () =>
        new Promise<LibrarySearchResponse>((resolve) => {
          release = resolve;
        }),
    );

    const { result, rerender } = renderHook(({ q }) => useTrackWindow(q), {
      initialProps: { q: query() },
    });
    rerender({ q: query({ sort: "bpm" }) });
    await waitFor(() => expect(result.current.total).toBe(TOTAL));

    // The first request finally answers — for the sort nobody is looking at.
    act(() => release?.(respond({ sort: "artist", limit: PAGE_SIZE })));
    await waitFor(() => expect(result.current.total).toBe(TOTAL));

    // Still the rows of the current query: the late one changed nothing.
    expect(browseLibrary).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "bpm" }),
    );
    expect(result.current.loadedRows).toBe(PAGE_SIZE);
  });

  it("is dropped when it arrives after the question changed, even unechoed", async () => {
    // An engine that does not echo (an older build) cannot be checked by what
    // it answers, so *when* it was asked for is the only thing left.
    let release: ((value: LibrarySearchResponse) => void) | null = null;
    browseLibrary.mockImplementationOnce(
      () =>
        new Promise<LibrarySearchResponse>((resolve) => {
          release = resolve;
        }),
    );

    const { result, rerender } = renderHook(({ q }) => useTrackWindow(q), {
      initialProps: { q: query() },
    });
    rerender({ q: query({ playlistId: 3 }) });
    await waitFor(() => expect(result.current.total).toBe(TOTAL));
    const loadedForCurrent = result.current.loadedRows;

    const unechoed = respond({}) as Partial<LibrarySearchResponse>;
    delete unechoed.mode;
    delete unechoed.scope;
    delete unechoed.sort;
    delete unechoed.dir;
    delete unechoed.filters;
    // Rows nothing in the current query could have produced, so "dropped" and
    // "coincidentally identical" cannot be confused.
    unechoed.tracks = [{ ...row(0), title: "From the old question" }];
    act(() => release?.(unechoed as LibrarySearchResponse));
    await waitFor(() => expect(result.current.total).toBe(TOTAL));

    expect(result.current.loadedRows).toBe(loadedForCurrent);
    expect(result.current.source.getRow(0)?.title).toBe("Track 1");
  });

  it("is dropped when the engine answers a different question", async () => {
    // Not a counter: the response says which question it answers, and this
    // one answers the wrong one.
    browseLibrary.mockResolvedValueOnce(respond({ sort: "bpm" }));

    const { result } = renderHook(() => useTrackWindow(query({ sort: "artist" })));
    await waitFor(() => expect(browseLibrary).toHaveBeenCalled());

    expect(result.current.source.getRow(0)).toBeUndefined();
    expect(result.current.total).toBe(0);
  });
});

describe("when the engine fails", () => {
  it("says so rather than spinning", async () => {
    browseLibrary.mockRejectedValueOnce(new Error("Engine offline"));

    const { result } = renderHook(() => useTrackWindow(query()));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Engine offline");
    expect(result.current.loading).toBe(false);
  });

  it("does not ask again for a page that failed", async () => {
    // The first page answers, so the table knows how many rows there are;
    // the page a scroll reaches next is the one that fails.
    let failNext = false;
    browseLibrary.mockImplementation(async (params: Call & Record<string, unknown>) => {
      if (failNext) throw new Error("Engine offline");
      calls.push({ offset: params.offset ?? 0, limit: params.limit ?? PAGE_SIZE });
      return respond(params);
    });

    const { result } = renderHook(() => useTrackWindow(query()));
    await waitFor(() => expect(result.current.total).toBe(TOTAL));

    failNext = true;
    act(() => result.current.source.requestWindow?.(5_000, 5_040));
    await waitFor(() => expect(result.current.status).toBe("error"));
    const afterFailure = browseLibrary.mock.calls.length;

    act(() => result.current.source.requestWindow?.(5_000, 5_040));
    act(() => result.current.source.requestWindow?.(5_010, 5_050));

    // A page known to have failed is not asked for again until a retry, or
    // every scroll event would re-run a request that is failing.
    expect(browseLibrary.mock.calls.length).toBe(afterFailure);
  });

  it("recovers when asked again", async () => {
    browseLibrary.mockRejectedValueOnce(new Error("Engine offline"));

    const { result } = renderHook(() => useTrackWindow(query()));
    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.error).toBeNull();
    expect(result.current.source.getRow(0)).toBeDefined();
  });

  it("says so when there is no bridge at all", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;

    const { result } = renderHook(() => useTrackWindow(query()));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatch(/engine is not available/i);
  });
});

describe("the paging arithmetic", () => {
  it("covers the visible range and its margin", () => {
    expect(pagesForRange(0, 20, TOTAL)).toEqual([0, 1]);
    expect(pagesForRange(500, 540, TOTAL)).toEqual([4, 5, 6]);
  });

  it("stops at the ends of the library", () => {
    expect(pagesForRange(0, 10, 50)).toEqual([0]);
    expect(pagesForRange(49_980, 49_999, TOTAL)).toEqual([498, 499]);
  });

  it("has nothing to fetch for an empty library", () => {
    // Not a special case in the code: with no rows the last page is before the
    // first, so the range is empty by arithmetic.
    expect(pagesForRange(0, 40, 0)).toEqual([]);
  });

  it("evicts nothing while it is within budget", () => {
    expect(pagesToEvict([1, 2, 3], 2, 12)).toEqual([]);
  });

  it("evicts the pages furthest from the window", () => {
    const loaded = [0, 1, 2, 40, 41, 42];
    expect(pagesToEvict(loaded, 41, 3).sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("keeps the page in view", () => {
    expect(pagesToEvict([0, 10, 20, 30], 10, 1)).not.toContain(10);
  });
});
