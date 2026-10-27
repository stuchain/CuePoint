import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLastValue } from "./useLastValue";

describe("useLastValue (M248)", () => {
  it("returns the value while there is one", () => {
    const { result } = renderHook(({ value }) => useLastValue(value), { initialProps: { value: "Peak time" as string | null } });
    expect(result.current).toBe("Peak time");
  });

  it("keeps the last one when the state that named it is cleared", () => {
    const { result, rerender } = renderHook(({ value }) => useLastValue(value), { initialProps: { value: "Peak time" as string | null } });
    rerender({ value: null });
    expect(result.current).toBe("Peak time");
    rerender({ value: "Warm-up" });
    expect(result.current).toBe("Warm-up");
  });

  it("is empty when there never was a value", () => {
    const { result } = renderHook(() => useLastValue<string>(null));
    expect(result.current).toBeNull();
  });
});
