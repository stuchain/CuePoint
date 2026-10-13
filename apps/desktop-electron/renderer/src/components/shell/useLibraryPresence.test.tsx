import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { announceLibraryChange } from "../../api/libraryChanges";
import { LIBRARY_SUMMARY, useSharedRead } from "../../api/sharedReads";
import { useLibraryEmpty } from "./useLibraryPresence";

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
});

describe("useLibraryEmpty", () => {
  it("retries on the timer after a read fails, and settles on what it then reads", async () => {
    const getLibrarySummary = vi
      .fn()
      .mockRejectedValueOnce(new Error("starting"))
      .mockResolvedValue({ library_empty: true });
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibrarySummary };

    const { result } = renderHook(() => useLibraryEmpty(10), { wrapper });

    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(getLibrarySummary.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("stops asking once the library has tracks", async () => {
    const getLibrarySummary = vi.fn().mockResolvedValue({ library_empty: false });
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibrarySummary };

    renderHook(() => useLibraryEmpty(10), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(getLibrarySummary).toHaveBeenCalledTimes(1);
  });

  it("never overlaps reads: slower answers than the poll do not pile up, and the value lands", async () => {
    let running = 0;
    let peak = 0;
    const getLibrarySummary = vi.fn(async () => {
      // The first call is the shared cache's own; the shell's private polls are 2 to 4.
      const mine = getLibrarySummary.mock.calls.length;
      if (mine > 1 && mine <= 4) {
        running += 1;
        peak = Math.max(peak, running);
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
      if (mine > 1 && mine <= 4) running -= 1;
      if (mine < 4) throw new Error("starting");
      return { library_empty: true };
    });
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibrarySummary };

    const { result } = renderHook(() => useLibraryEmpty(5), { wrapper });
    await waitFor(() => expect(result.current).toBe(true), { timeout: 3000 });
    expect(peak).toBe(1);
  });

  it("is not empty after a later failed read, though the cache keeps the old value", async () => {
    const getLibrarySummary = vi
      .fn()
      .mockResolvedValueOnce({ library_empty: true })
      .mockRejectedValue(new Error("gone"));
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibrarySummary };

    const { result } = renderHook(() => useLibraryEmpty(10_000), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
    act(() => announceLibraryChange());
    await waitFor(() => expect(getLibrarySummary).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("asks privately while unread and refreshes the shared read once when an answer differs", async () => {
    let sharedCalls = 0;
    const getLibrarySummary = vi.fn(async () => {
      sharedCalls += 1;
      if (sharedCalls <= 3) throw new Error("starting");
      return { library_empty: false };
    });
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibrarySummary };

    const { result } = renderHook(() => ({ empty: useLibraryEmpty(10), shared: useSharedRead(LIBRARY_SUMMARY) }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.shared.value).toEqual({ library_empty: false }));
    expect(result.current.empty).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(getLibrarySummary).toHaveBeenCalledTimes(5);
  });
});
