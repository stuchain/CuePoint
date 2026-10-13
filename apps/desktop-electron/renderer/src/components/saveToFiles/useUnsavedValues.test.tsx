import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { announceLibraryChange } from "../../api/libraryChanges";
import { useUnsavedValues } from "./useUnsavedValues";

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("useUnsavedValues", () => {
  it("reads the count on mount and again when the library changes", async () => {
    const getUnsavedValues = vi
      .fn()
      .mockResolvedValueOnce({ tracks: 47, fields: { key: 40 } })
      .mockResolvedValueOnce({ tracks: 3, fields: { key: 3 } });
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getUnsavedValues };
    const { result } = renderHook(() => useUnsavedValues());
    expect(result.current.unsaved).toBeNull();
    await waitFor(() => expect(result.current.unsaved?.tracks).toBe(47));
    expect(getUnsavedValues).toHaveBeenCalledTimes(1);

    act(() => announceLibraryChange());
    await waitFor(() => expect(result.current.unsaved?.tracks).toBe(3));
    expect(getUnsavedValues).toHaveBeenCalledTimes(2);
  });

  it("can be asked to read again, which is what follows a write", async () => {
    const getUnsavedValues = vi.fn().mockResolvedValue({ tracks: 5, fields: {} });
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getUnsavedValues };
    const { result } = renderHook(() => useUnsavedValues());
    await waitFor(() => expect(result.current.unsaved?.tracks).toBe(5));
    await act(async () => result.current.reload());
    expect(getUnsavedValues).toHaveBeenCalledTimes(2);
  });

  it("keeps the last answer when a read fails, and has none without the desktop app", async () => {
    const getUnsavedValues = vi
      .fn()
      .mockResolvedValueOnce({ tracks: 9, fields: {} })
      .mockRejectedValueOnce(new Error("lost touch"));
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getUnsavedValues };
    const { result } = renderHook(() => useUnsavedValues());
    await waitFor(() => expect(result.current.unsaved?.tracks).toBe(9));
    act(() => announceLibraryChange());
    await waitFor(() => expect(getUnsavedValues).toHaveBeenCalledTimes(2));
    expect(result.current.unsaved?.tracks).toBe(9);

    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    const bare = renderHook(() => useUnsavedValues());
    expect(bare.result.current.unsaved).toBeNull();
  });
});
