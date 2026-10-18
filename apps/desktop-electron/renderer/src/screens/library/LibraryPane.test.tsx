import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { PLAYLISTS_FOLD_STORAGE_KEY, usePlaylistsFold } from "./LibraryPane";

beforeEach(() => localStorage.clear());

describe("usePlaylistsFold (N5)", () => {
  it("starts open, and remembers a fold across a remount", () => {
    const first = renderHook(() => usePlaylistsFold());
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1](true));
    expect(first.result.current[0]).toBe(true);
    expect(localStorage.getItem(PLAYLISTS_FOLD_STORAGE_KEY)).toBe("1");
    first.unmount();
    const second = renderHook(() => usePlaylistsFold());
    expect(second.result.current[0]).toBe(true);
    act(() => second.result.current[1](false));
    expect(renderHook(() => usePlaylistsFold()).result.current[0]).toBe(false);
  });
});
