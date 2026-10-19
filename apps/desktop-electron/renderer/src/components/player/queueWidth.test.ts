import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadQueueWidth,
  QUEUE_DEFAULT_WIDTH,
  QUEUE_MAX_WIDTH,
  QUEUE_MIN_WIDTH,
  QUEUE_WIDTH_STORAGE_KEY,
  queueWidthPx,
  resetQueueWidthForTests,
  setQueueWidth1x,
  useQueueWidth,
} from "./queueWidth";

/**
 * The queue's width (C204, D11): it opens at the Track details width, 213 times the text size,
 * can be dragged from 200 to 448 times the text size, and remembers the choice in 1x units so the
 * same panel follows a change of text size.
 */

afterEach(() => {
  localStorage.clear();
  resetQueueWidthForTests();
  vi.restoreAllMocks();
});

describe("the width drawn", () => {
  it("opens at the Track details width: 213 times the text size", () => {
    expect(QUEUE_DEFAULT_WIDTH).toBe(213);
    expect(queueWidthPx(QUEUE_DEFAULT_WIDTH, 1)).toBe(213);
    expect(queueWidthPx(QUEUE_DEFAULT_WIDTH, 1.25)).toBe(266);
    expect(queueWidthPx(QUEUE_DEFAULT_WIDTH, 1.5)).toBe(320);
  });

  it("clamps from 200 to 448 times the text size", () => {
    expect([QUEUE_MIN_WIDTH, QUEUE_MAX_WIDTH]).toEqual([200, 448]);
    expect(queueWidthPx(50, 1.25)).toBe(250);
    expect(queueWidthPx(9999, 1.25)).toBe(560);
    expect(queueWidthPx(200, 1)).toBe(200);
    expect(queueWidthPx(448, 1)).toBe(448);
  });

  it("takes at most half of a narrow window, and never less than its minimum", () => {
    expect(queueWidthPx(448, 1.25, 1024)).toBe(512);
    expect(queueWidthPx(448, 1, 300)).toBe(200);
  });

  it("falls back to the default for a width that is not a number", () => {
    expect(queueWidthPx(Number.NaN, 1.25)).toBe(266);
  });
});

describe("the width kept", () => {
  it("starts at the default when nothing is stored", () => {
    expect(loadQueueWidth()).toBe(QUEUE_DEFAULT_WIDTH);
  });

  it("is stored in 1x units under cuepoint.queue.width1x", () => {
    expect(QUEUE_WIDTH_STORAGE_KEY).toBe("cuepoint.queue.width1x");
    setQueueWidth1x(300);
    expect(localStorage.getItem("cuepoint.queue.width1x")).toBe("300");
    expect(loadQueueWidth()).toBe(300);
  });

  it("clamps what it stores and what it reads back", () => {
    setQueueWidth1x(10);
    expect(localStorage.getItem(QUEUE_WIDTH_STORAGE_KEY)).toBe("200");
    localStorage.setItem(QUEUE_WIDTH_STORAGE_KEY, "9000");
    expect(loadQueueWidth()).toBe(448);
    localStorage.setItem(QUEUE_WIDTH_STORAGE_KEY, "wide");
    expect(loadQueueWidth()).toBe(QUEUE_DEFAULT_WIDTH);
  });

  it("tells every reader at once", () => {
    const first = renderHook(() => useQueueWidth());
    const second = renderHook(() => useQueueWidth());
    act(() => setQueueWidth1x(260));
    expect(first.result.current).toBe(260);
    expect(second.result.current).toBe(260);
  });

  it("carries on when storage refuses", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useQueueWidth());
    expect(() => act(() => setQueueWidth1x(250))).not.toThrow();
    expect(result.current).toBe(250);
  });
});
