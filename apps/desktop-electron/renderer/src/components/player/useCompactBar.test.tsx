/**
 * The compact player bar and the zoomed strip share one "short window" threshold (C207): 700
 * pixels of content height in the text size's own units, so at 1.5x it is 1050 real pixels. The
 * stylesheet reads it as `:root[data-short-window]`, never as a literal media query.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { shortWindowQueryFor, useShortWindowFlag } from "../waveform/waveformDetailSetting";
import { useCompactBar } from "./useCompactBar";
import playerBarCss from "./PlayerBar.css?raw";

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
  delete document.documentElement.dataset.scale;
  document.documentElement.removeAttribute("data-short-window");
});

function mockMedia(heightPx: number) {
  const listeners = new Set<() => void>();
  let height = heightPx;
  const asked: string[] = [];
  window.matchMedia = ((query: string) => {
    asked.push(query);
    const limit = Number(/max-height:\s*([\d.]+)px/.exec(query)?.[1] ?? 0);
    return {
      get matches() {
        return height <= limit;
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    };
  }) as unknown as typeof window.matchMedia;
  return {
    asked,
    resize(next: number) {
      height = next;
      listeners.forEach((fn) => fn());
    },
  };
}

describe("useCompactBar", () => {
  it("is false at 735 and true under 700 at 1x, following a resize", () => {
    const media = mockMedia(735);
    const { result } = renderHook(() => useCompactBar());
    expect(result.current).toBe(false);
    act(() => media.resize(699));
    expect(result.current).toBe(true);
    act(() => media.resize(735));
    expect(result.current).toBe(false);
  });

  it("asks the question the strip's setting asks, in the size's own units", () => {
    document.documentElement.dataset.scale = "1.5";
    const media = mockMedia(735);
    const { result } = renderHook(() => useCompactBar());
    expect(media.asked).toContain(shortWindowQueryFor(1.5));
    // 735 real pixels at 1.5x is 490 scaled: short, so compact.
    expect(result.current).toBe(true);
  });

  it("reads a platform without matchMedia as tall", () => {
    // @ts-expect-error removing it is the point
    window.matchMedia = undefined;
    const { result } = renderHook(() => useCompactBar());
    expect(result.current).toBe(false);
    expect(vi.isMockFunction(window.matchMedia)).toBe(false);
  });
});

describe("the stylesheet's side of it", () => {
  it("styles the compact bar from the flag, with no literal height in a media query", () => {
    expect(playerBarCss).not.toMatch(/max-height:\s*\d+px/);
    expect(playerBarCss).toContain(":root[data-short-window] .cp-player-bar");
  });

  it("keeps Play wider than the other transport keys in the compact bar", () => {
    expect(playerBarCss).toMatch(
      /:root\[data-short-window\] \.cp-player-bar__button--play\s*\{[^}]*min-width:\s*calc\(var\(--control-height\) \* 1\.25\)/,
    );
  });
});

describe("the flag on the page", () => {
  it("is set while the window is short and cleared when it is tall", () => {
    const media = mockMedia(600);
    const { unmount } = renderHook(() => useShortWindowFlag());
    expect(document.documentElement.hasAttribute("data-short-window")).toBe(true);
    act(() => media.resize(900));
    expect(document.documentElement.hasAttribute("data-short-window")).toBe(false);
    act(() => media.resize(500));
    expect(document.documentElement.hasAttribute("data-short-window")).toBe(true);
    unmount();
    expect(document.documentElement.hasAttribute("data-short-window")).toBe(false);
  });
});
