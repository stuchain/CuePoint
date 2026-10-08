import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

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
});
