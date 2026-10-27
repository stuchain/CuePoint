import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOADING_DELAY_MS, LOADING_MINIMUM_MS, Loading, loadingWords, useLoadingGate } from "./Loading";
import css from "./Loading.css?raw";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Loading (M371, M372)", () => {
  it("says what is loading in the one wording", () => {
    expect(loadingWords("tracks")).toBe("Loading tracks…");
    expect(loadingWords()).toBe("Loading…");
  });

  it("holds its room but is not drawn for the first 300 ms, so a quick load never flashes it", () => {
    const { container } = render(<Loading what="tracks" />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute("data-waiting");
    expect(screen.getByText("Loading tracks…")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(LOADING_DELAY_MS - 1);
    });
    expect(root).toHaveAttribute("data-waiting");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(root).not.toHaveAttribute("data-waiting");
    expect(css).toMatch(/\.cp-loading\[data-waiting\] \{[^}]*opacity:\s*0/);
  });

  it("starts where an empty state starts, so the words do not drop when one replaces the other", () => {
    expect(css).toMatch(/\.cp-loading--centered::before \{[^}]*flex:\s*0 0 max\(0px, calc\(100% \/ 3 - 2 \* var\(--space-2xl\)\)\)/);
  });
});

describe("useLoadingGate", () => {
  it("shows nothing for a short wait", () => {
    const { result, rerender } = renderHook(({ loading }) => useLoadingGate(loading), { initialProps: { loading: true } });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(false);
  });

  it("shows after the delay and stays for the minimum once it showed", () => {
    const { result, rerender } = renderHook(({ loading }) => useLoadingGate(loading), { initialProps: { loading: true } });
    act(() => {
      vi.advanceTimersByTime(LOADING_DELAY_MS);
    });
    expect(result.current).toBe(true);
    // The wait ends 100 ms after it showed: it stays 300 ms more.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ loading: false });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(LOADING_MINIMUM_MS - 100 - 1);
    });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });
});
