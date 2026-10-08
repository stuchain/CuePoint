/**
 * The quick-filter lists follow the view, and say nothing when it cannot be asked
 * for (PAGES-05B).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { LibraryQuickFacets } from "../../api/cuepointBridge.types";
import type { LibraryQuery } from "./libraryQuery";

const reportUnexpected = vi.fn();
vi.mock("../../reporting/reporting", () => ({ reportUnexpected: (e: unknown) => reportUnexpected(e) }));

import { useQuickFacets } from "./useFilterVocabulary";

const FACETS: LibraryQuickFacets = {
  keys: [{ value: "8A", count: 3 }],
  no_key: 0,
  bpm: { min: 120, max: 128, missing: 0 },
  genres: [],
  genres_total: 0,
  genres_truncated: false,
};

const QUERY = {
  q: "",
  playlistId: null,
  filters: null,
  scope: undefined,
  collectionId: null,
} as unknown as LibraryQuery;

let getLibraryQuickFacets: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reportUnexpected.mockReset();
  getLibraryQuickFacets = vi.fn().mockResolvedValue(FACETS);
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibraryQuickFacets };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("useQuickFacets", () => {
  it("drops the last view's lists when the view's cannot be asked for", async () => {
    const { result, rerender } = renderHook(({ query }) => useQuickFacets(query), {
      initialProps: { query: QUERY },
    });
    act(() => result.current.load());
    await waitFor(() => expect(result.current.facets).toEqual(FACETS));

    getLibraryQuickFacets.mockRejectedValue(Object.assign(new Error("bad rule"), { status: 400 }));
    rerender({ query: { ...QUERY, q: "x" } });

    await waitFor(() => expect(result.current.facets).toBeNull());
    expect(result.current.loading).toBe(false);
    expect(reportUnexpected).not.toHaveBeenCalled();
  });

  it("still reports a fault of the engine's", async () => {
    getLibraryQuickFacets.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));
    const { result } = renderHook(() => useQuickFacets(QUERY));
    act(() => result.current.load());
    await waitFor(() => expect(reportUnexpected).toHaveBeenCalledTimes(1));
    expect(result.current.facets).toBeNull();
  });
});
