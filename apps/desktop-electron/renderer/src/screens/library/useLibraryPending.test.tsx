import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import { useLibraryPending } from "./useLibraryPending";

const ANSWER = { values_not_in_files: 3, changes_not_exported: 1, last_export_at: null };

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("useLibraryPending (M511)", () => {
  it("is null with no engine to ask", () => {
    const { result } = renderHook(() => useLibraryPending(1));
    expect(result.current).toBeNull();
  });

  it("reads the engine's answer, and again when the key changes or the window is looked at again", async () => {
    const ask = vi.fn().mockResolvedValue(ANSWER);
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibraryPending: ask };
    const { result, rerender } = renderHook(({ key }) => useLibraryPending(key), { initialProps: { key: 1 } });
    await waitFor(() => expect(result.current).toEqual(ANSWER));
    expect(ask).toHaveBeenCalledTimes(1);
    rerender({ key: 2 });
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(3));
  });

  it("asks once for a key with the same values, however often the caller renders", async () => {
    const ask = vi.fn().mockResolvedValue(ANSWER);
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibraryPending: ask };
    // A new array each render, as LibraryScreen passes it.
    const { result, rerender } = renderHook(({ at }) => useLibraryPending([at, null, true]), {
      initialProps: { at: "2026-10-30" },
    });
    await waitFor(() => expect(result.current).toEqual(ANSWER));
    for (let i = 0; i < 20; i += 1) rerender({ at: "2026-10-30" });
    expect(ask).toHaveBeenCalledTimes(1);
    rerender({ at: "2026-10-31" });
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
  });
});
