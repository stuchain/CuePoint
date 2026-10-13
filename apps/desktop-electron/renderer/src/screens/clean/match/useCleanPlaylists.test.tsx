/** The Playlists view's data (C22): read on mount, on a library change, and while a match runs. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import type { CleanPlaylists } from "../../../api/cuepointBridge.types";
import { announceLibraryChange } from "../../../api/libraryChanges";
import { PLAYLISTS_POLL_MS, usePlaylistTicks, useCleanPlaylists } from "./useCleanPlaylists";

const COUNTS = {
  track_count: 3,
  not_matched: 3,
  waiting: 0,
  accepted: 0,
  rejected: 0,
  no_match: 0,
  unsaved: 0,
  running: null,
};
const DATA: CleanPlaylists = {
  whole_library: COUNTS,
  playlists: [{ id: 1, name: "a", path: "a", ...COUNTS }],
};

let read: ReturnType<typeof vi.fn>;

beforeEach(() => {
  read = vi.fn().mockResolvedValue(DATA);
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getCleanPlaylists: read };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.useRealTimers();
});

describe("useCleanPlaylists", () => {
  it("loads on mount", async () => {
    const { result } = renderHook(() => useCleanPlaylists(false));
    await waitFor(() => expect(result.current.data).toEqual(DATA));
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it("reads again when the library changes", async () => {
    const { result } = renderHook(() => useCleanPlaylists(false));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    act(() => announceLibraryChange());
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it("says the desktop app is needed when the build has no route", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    const { result } = renderHook(() => useCleanPlaylists(false));
    await waitFor(() => expect(result.current.error).toBe("This needs the CuePoint desktop app."));
  });

  it("reads every two seconds while a match runs, and once more when it ends", async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ matching }) => useCleanPlaylists(matching), {
      initialProps: { matching: true },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAYLISTS_POLL_MS);
    });
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAYLISTS_POLL_MS);
    });
    expect(read).toHaveBeenCalledTimes(3);

    rerender({ matching: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(read).toHaveBeenCalledTimes(4);
    // No more once it has ended.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAYLISTS_POLL_MS * 3);
    });
    expect(read).toHaveBeenCalledTimes(4);
  });
});

describe("useCleanPlaylists while the page is hidden", () => {
  it("neither reads on a change nor polls, and reads once when shown again", async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ active }) => useCleanPlaylists(true, active), {
      initialProps: { active: false },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAYLISTS_POLL_MS * 3);
    });
    act(() => announceLibraryChange());
    expect(read).not.toHaveBeenCalled();

    rerender({ active: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not drop an answer that is still on its way when the timer fires", async () => {
    vi.useFakeTimers();
    let release: ((value: CleanPlaylists) => void) | undefined;
    read.mockImplementation(
      () =>
        new Promise<CleanPlaylists>((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderHook(() => useCleanPlaylists(true, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLAYLISTS_POLL_MS * 3);
    });
    // The first read has not answered: the timer waits for it instead of overtaking it.
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.(DATA);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data).toEqual(DATA);
  });
});

describe("usePlaylistTicks", () => {
  it("lists the ticked rows, only the whole library when that is ticked, and clears", () => {
    const { result } = renderHook(() => usePlaylistTicks(DATA));
    act(() => result.current.onTick("playlist:1", true));
    expect(result.current.rows.map((row) => row.name)).toEqual(["a"]);
    act(() => result.current.onTick("library", true));
    expect(result.current.rows.map((row) => row.name)).toEqual(["Whole library"]);
    act(() => result.current.onTick("library", false));
    act(() => result.current.onTick("playlist:1", false));
    expect(result.current.rows).toEqual([]);
    act(() => result.current.onTick("library", true));
    act(() => result.current.clear());
    expect(result.current.rows).toEqual([]);
  });
});
