/**
 * The compact player bar starts under 700px of window height (B1): 735 keeps the zoomed strip.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COMPACT_BAR_QUERY, useCompactBar } from "./useCompactBar";
import playerBarCss from "./PlayerBar.css?raw";

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

function mockMedia(heightPx: number) {
  const listeners = new Set<() => void>();
  let height = heightPx;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === COMPACT_BAR_QUERY && height < 700;
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

  it("asks the same question the stylesheet does", () => {
    expect(COMPACT_BAR_QUERY).toBe("(max-height: 699px)");
    expect(playerBarCss).toContain(`@media ${COMPACT_BAR_QUERY}`);
  });

  it("reads a platform without matchMedia as tall", () => {
    // @ts-expect-error removing it is the point
    window.matchMedia = undefined;
    const { result } = renderHook(() => useCompactBar());
    expect(result.current).toBe(false);
    expect(vi.isMockFunction(window.matchMedia)).toBe(false);
  });
});
