/**
 * The scope's size with no search or filter (LIB-8): asked for only while
 * something narrows the view.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LIBRARY_QUERY } from "./libraryQuery";
import { isNarrowed, useScopeTotal } from "./useScopeTotal";

function bridge(total: number) {
  const browseLibrary = vi.fn().mockResolvedValue({ total, tracks: [], track_ids: [] });
  (window as unknown as { cuepoint?: unknown }).cuepoint = { browseLibrary };
  return browseLibrary;
}

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("isNarrowed", () => {
  it("is true for a search or a filter, false for neither", () => {
    expect(isNarrowed(DEFAULT_LIBRARY_QUERY)).toBe(false);
    expect(isNarrowed({ ...DEFAULT_LIBRARY_QUERY, q: " " })).toBe(false);
    expect(isNarrowed({ ...DEFAULT_LIBRARY_QUERY, q: "kiko" })).toBe(true);
    expect(
      isNarrowed({
        ...DEFAULT_LIBRARY_QUERY,
        filters: { match: "all", rules: [{ field: "bpm", operator: "gt", value: 120 }] } as never,
      }),
    ).toBe(true);
  });
});

describe("useScopeTotal", () => {
  it("asks nothing and answers the view's own total when nothing narrows it", () => {
    const browse = bridge(12000);
    const { result } = renderHook(() => useScopeTotal(DEFAULT_LIBRARY_QUERY, 12000, "0"));
    expect(result.current).toBe(12000);
    expect(browse).not.toHaveBeenCalled();
  });

  it("asks the same scope without the search, and answers its total", async () => {
    const browse = bridge(12000);
    const query = { ...DEFAULT_LIBRARY_QUERY, q: "kiko", playlistId: 7 };
    const { result } = renderHook(() => useScopeTotal(query, 240, "0"));
    expect(result.current).toBe(240);
    await waitFor(() => expect(result.current).toBe(12000));
    expect(browse).toHaveBeenCalledWith(
      expect.objectContaining({ q: undefined, filters: null, playlistId: 7, fields: "id", limit: 1 }),
    );
  });
});
