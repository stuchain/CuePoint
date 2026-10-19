/**
 * Whether the shell's Track details panel is open (C226): the panel publishes its state to the
 * Details toggle's store, and a page reads the same store instead of looking for the panel in the DOM.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { publishDetails, useDetailsOpen } from "./detailsToggle";

afterEach(() => {
  act(() => publishDetails(null));
});

describe("useDetailsOpen", () => {
  it("is false with nothing published", () => {
    const { result } = renderHook(() => useDetailsOpen());
    expect(result.current).toBe(false);
  });

  it("follows what the panel publishes", () => {
    const toggle = vi.fn();
    const { result } = renderHook(() => useDetailsOpen());
    act(() => publishDetails({ open: true, toggle }));
    expect(result.current).toBe(true);
    act(() => publishDetails({ open: false, toggle }));
    expect(result.current).toBe(false);
    act(() => publishDetails({ open: true, toggle }));
    act(() => publishDetails(null));
    expect(result.current).toBe(false);
  });

  it("is true at once when the panel is already open", () => {
    publishDetails({ open: true, toggle: vi.fn() });
    const { result } = renderHook(() => useDetailsOpen());
    expect(result.current).toBe(true);
  });
});
