/**
 * What a scope holds, asked once per scope (K9): never for a search or a
 * filter, so typing does not ask again.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LibraryQuickFacets } from "../../api/cuepointBridge.types";
import { DEFAULT_LIBRARY_QUERY } from "./libraryQuery";
import { useScopeFacts } from "./useScopeFacts";

function facts(total: number): LibraryQuickFacets {
  return {
    keys: [],
    no_key: 0,
    bpm: { min: 120, max: 128, missing: 0 },
    genres: [],
    genres_total: 0,
    genres_truncated: false,
    total,
    total_seconds: 3600,
    duration_missing: 0,
  };
}

function bridge(impl: (params: unknown) => Promise<LibraryQuickFacets>) {
  const getLibraryQuickFacets = vi.fn(impl);
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibraryQuickFacets };
  return getLibraryQuickFacets;
}

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("useScopeFacts", () => {
  it("asks for the scope with no search and no filter", async () => {
    const ask = bridge(() => Promise.resolve(facts(36)));
    const query = {
      ...DEFAULT_LIBRARY_QUERY,
      q: "kiko",
      playlistId: 7,
      filters: { match: "all", rules: [{ field: "bpm", operator: "gt", value: 1 }] } as never,
    };
    const { result } = renderHook(() => useScopeFacts(query, "0"));
    expect(result.current.facts).toBeNull();
    await waitFor(() => expect(result.current.facts?.total).toBe(36));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ q: "", filters: null, playlistId: 7, collectionId: null }),
    );
  });

  it("does not ask again while the user types", async () => {
    const ask = bridge(() => Promise.resolve(facts(36)));
    // The page passes the whole query; only its scope fields name the scope.
    const { result, rerender } = renderHook(
      ({ query }) => useScopeFacts(query, "0"),
      { initialProps: { query: { ...DEFAULT_LIBRARY_QUERY, q: "" } } },
    );
    await waitFor(() => expect(result.current.facts).not.toBeNull());
    rerender({ query: { ...DEFAULT_LIBRARY_QUERY, q: "ki" } });
    rerender({ query: { ...DEFAULT_LIBRARY_QUERY, q: "kiko" } });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(result.current.facts?.total).toBe(36);
  });

  it("asks again for another scope, and shows nothing from the old one meanwhile", async () => {
    let release: (value: LibraryQuickFacets) => void = () => undefined;
    const ask = bridge((params) =>
      (params as { playlistId: number | null }).playlistId === 9
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve(facts(36)),
    );
    const { result, rerender } = renderHook(
      ({ playlistId }) => useScopeFacts({ ...DEFAULT_LIBRARY_QUERY, playlistId }, "0"),
      { initialProps: { playlistId: null as number | null } },
    );
    await waitFor(() => expect(result.current.facts?.total).toBe(36));
    rerender({ playlistId: 9 });
    expect(result.current.facts).toBeNull();
    release(facts(5));
    await waitFor(() => expect(result.current.facts?.total).toBe(5));
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("drops an answer that arrives after the scope changed", async () => {
    const pending: Array<(value: LibraryQuickFacets) => void> = [];
    bridge(() => new Promise((resolve) => pending.push(resolve)));
    const { result, rerender } = renderHook(
      ({ playlistId }) => useScopeFacts({ ...DEFAULT_LIBRARY_QUERY, playlistId }, "0"),
      { initialProps: { playlistId: 1 as number | null } },
    );
    rerender({ playlistId: 2 });
    pending[0]!(facts(111));
    pending[1]!(facts(2));
    await waitFor(() => expect(result.current.facts?.total).toBe(2));
  });

  it("asks again when the library changes", async () => {
    const ask = bridge(() => Promise.resolve(facts(36)));
    const { result, rerender } = renderHook(
      ({ identity }) => useScopeFacts(DEFAULT_LIBRARY_QUERY, identity),
      { initialProps: { identity: "a" } },
    );
    await waitFor(() => expect(result.current.facts).not.toBeNull());
    rerender({ identity: "b" });
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
  });

  it("describes an explicit scope, such as a Smart Collection being edited", async () => {
    const ask = bridge(() => Promise.resolve(facts(12)));
    const { result } = renderHook(() =>
      useScopeFacts({ playlistId: null, collectionId: 4, scope: "smart" }, "0"),
    );
    await waitFor(() => expect(result.current.facts?.total).toBe(12));
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ q: "", filters: null, collectionId: 4, scope: "smart" }),
    );
  });

  it("answers nothing when the facts cannot be read", async () => {
    const ask = bridge(() => Promise.reject(new Error("gone")));
    const { result } = renderHook(() => useScopeFacts(DEFAULT_LIBRARY_QUERY, "0"));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(result.current.facts).toBeNull();
  });
});
