import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { invalidateReads } from "./engineReads";
import {
  COLLECTIONS,
  LIBRARY_PLAYLISTS,
  LIBRARY_SUMMARY,
  statisticsPlays,
  keysPopulation,
  useOnReadError,
  useSharedRead,
} from "./sharedReads";

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

function install(bridge: Record<string, unknown>) {
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
}

describe("useSharedRead", () => {
  it("two hooks over one descriptor are one bridge call", async () => {
    const getLibraryPlaylists = vi.fn().mockResolvedValue({ playlists: [], total: 0 });
    install({ getLibraryPlaylists });

    const a = renderHook(() => useSharedRead(LIBRARY_PLAYLISTS));
    const b = renderHook(() => useSharedRead(LIBRARY_PLAYLISTS));

    await waitFor(() => expect(a.result.current.value).toEqual({ playlists: [], total: 0 }));
    await waitFor(() => expect(b.result.current.value).toEqual({ playlists: [], total: 0 }));
    expect(getLibraryPlaylists).toHaveBeenCalledTimes(1);
    expect(a.result.current.unavailable).toBe(false);
  });

  it("a missing bridge method is unavailable and reads nothing", () => {
    install({});
    const { result } = renderHook(() => useSharedRead(COLLECTIONS));
    expect(result.current.unavailable).toBe(true);
    expect(result.current.value).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  it("no bridge at all is unavailable too", () => {
    const { result } = renderHook(() => useSharedRead(LIBRARY_SUMMARY));
    expect(result.current.unavailable).toBe(true);
  });

  it("reads again after its domain is invalidated", async () => {
    const getLibrarySummary = vi
      .fn()
      .mockResolvedValueOnce({ track_count: 1 })
      .mockResolvedValue({ track_count: 2 });
    install({ getLibrarySummary });
    const { result } = renderHook(() => useSharedRead(LIBRARY_SUMMARY));
    await waitFor(() => expect(result.current.value).toEqual({ track_count: 1 }));

    invalidateReads(["library"]);
    await waitFor(() => expect(result.current.value).toEqual({ track_count: 2 }));
    expect(getLibrarySummary).toHaveBeenCalledTimes(2);
  });

  it("puts every parameter in the key, so one parameter's answer is not served for another", async () => {
    const getStatisticsPlays = vi.fn(async (params?: { limit?: number }) => ({ limit: params?.limit }));
    const getKeysPopulation = vi.fn(async () => ({ n: 1 }));
    install({ getStatisticsPlays, getKeysPopulation });

    expect(statisticsPlays({ limit: 10 }).key).not.toBe(statisticsPlays({ limit: 25 }).key);
    expect(statisticsPlays({ limit: 10 }).key).toBe(statisticsPlays({ limit: 10 }).key);
    expect(keysPopulation([{ kind: "playlist", id: 1 }]).key).not.toBe(
      keysPopulation([{ kind: "playlist", id: 2 }]).key,
    );

    const ten = renderHook(() => useSharedRead(statisticsPlays({ limit: 10 })));
    const twentyFive = renderHook(() => useSharedRead(statisticsPlays({ limit: 25 })));
    await waitFor(() => expect(ten.result.current.value).toEqual({ limit: 10 }));
    await waitFor(() => expect(twentyFive.result.current.value).toEqual({ limit: 25 }));
    expect(getStatisticsPlays).toHaveBeenCalledTimes(2);
  });
});

describe("useOnReadError", () => {
  it("does not say an old failure again when a page mounts again", async () => {
    const failure = new Error("nope");
    const onError = vi.fn();
    const first = renderHook(() => useOnReadError(failure, onError));
    expect(onError).toHaveBeenCalledTimes(1);
    first.unmount();
    renderHook(() => useOnReadError(failure, onError));
    expect(onError).toHaveBeenCalledTimes(1);
    renderHook(() => useOnReadError(new Error("another"), onError));
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
