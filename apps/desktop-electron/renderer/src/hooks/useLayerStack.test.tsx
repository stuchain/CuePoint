import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useLayerStack } from "./useLayerStack";

describe("useLayerStack (M469)", () => {
  it("makes the newest open layer the only one that answers", () => {
    const first = renderHook(({ open }) => useLayerStack(open), { initialProps: { open: true } });
    expect(first.result.current()).toBe(true);
    const second = renderHook(({ open }) => useLayerStack(open), { initialProps: { open: true } });
    expect(second.result.current()).toBe(true);
    expect(first.result.current()).toBe(false);
    // The newer one closes: the older answers again.
    second.rerender({ open: false });
    expect(first.result.current()).toBe(true);
    first.unmount();
    second.unmount();
  });

  it("does not count a layer that is closed", () => {
    const closed = renderHook(() => useLayerStack(false));
    const open = renderHook(() => useLayerStack(true));
    expect(open.result.current()).toBe(true);
    expect(closed.result.current()).toBe(false);
    open.unmount();
    closed.unmount();
  });
});
