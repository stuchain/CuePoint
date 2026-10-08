import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SavedTick, useSavedSignal } from "./SavedTick";

/** SET-10: a "Saved" tick beside an instant setting, for about two seconds. */

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SavedTick", () => {
  it("is an empty status until a setting changes", () => {
    render(<SavedTick signal={0} />);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("says Saved when the signal changes, and goes after about two seconds", () => {
    const { rerender } = render(<SavedTick signal={0} />);
    rerender(<SavedTick signal={1} />);
    expect(screen.getByRole("status")).toHaveTextContent("✓ Saved");
    act(() => {
      vi.advanceTimersByTime(1900);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("starts the two seconds again on a second change", () => {
    const { rerender } = render(<SavedTick signal={0} />);
    rerender(<SavedTick signal={1} />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    rerender(<SavedTick signal={2} />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});

describe("useSavedSignal", () => {
  it("counts the changes it is told about", () => {
    const { result } = renderHook(() => useSavedSignal());
    expect(result.current[0]).toBe(0);
    act(() => result.current[1]());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(2);
  });
});
