/**
 * The compact player bar starts under 700px of real window height, at every interface size
 * (B1, C207): 735 keeps the full bar and the zoom toggle.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COMPACT_BAR_MAX_PX, COMPACT_BAR_QUERY, useCompactBar, useCompactBarFlag } from "./useCompactBar";
import playerBarCss from "./PlayerBar.css?raw";

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
  document.documentElement.removeAttribute("data-scale");
});

function mockMedia(heightPx: number) {
  const listeners = new Set<() => void>();
  let height = heightPx;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === COMPACT_BAR_QUERY && height <= COMPACT_BAR_MAX_PX;
    },
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  })) as unknown as typeof window.matchMedia;
  return (next: number) => {
    height = next;
    listeners.forEach((fn) => fn());
  };
}

describe("useCompactBar", () => {
  it("is false at 735 and true under 700, following a resize", () => {
    const resize = mockMedia(735);
    const { result } = renderHook(() => useCompactBar());
    expect(result.current).toBe(false);
    act(() => resize(699));
    expect(result.current).toBe(true);
    act(() => resize(735));
    expect(result.current).toBe(false);
  });

  it("does not move with the interface size", () => {
    mockMedia(735);
    for (const scale of ["1.25", "1.5", "2"]) {
      document.documentElement.dataset.scale = scale;
      const { result } = renderHook(() => useCompactBar());
      expect(result.current, `735 at ${scale}x`).toBe(false);
    }
  });

  it("is one unscaled constant", () => {
    expect(COMPACT_BAR_MAX_PX).toBe(699.98);
    expect(COMPACT_BAR_QUERY).toBe("(max-height: 699.98px)");
    // The stylesheet asks through the flag, never with a number of its own.
    expect(playerBarCss).not.toMatch(/max-height:\s*\d/);
    expect(playerBarCss).toContain(":root[data-short-window]");
  });

  it("reads a platform without matchMedia as tall", () => {
    // @ts-expect-error removing it is the point
    window.matchMedia = undefined;
    const { result } = renderHook(() => useCompactBar());
    expect(result.current).toBe(false);
    expect(vi.isMockFunction(window.matchMedia)).toBe(false);
  });
});

describe("useCompactBarFlag", () => {
  it("sets data-short-window while compact and removes it when tall or unmounted", () => {
    const resize = mockMedia(640);
    const { unmount } = renderHook(() => useCompactBarFlag());
    const has = () => document.documentElement.hasAttribute("data-short-window");
    expect(has()).toBe(true);
    act(() => resize(735));
    expect(has()).toBe(false);
    act(() => resize(600));
    expect(has()).toBe(true);
    unmount();
    expect(has()).toBe(false);
  });
});
