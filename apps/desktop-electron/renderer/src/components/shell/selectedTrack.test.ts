import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { getSelectedTrack, setSelectedTrack, useSelectedTrack } from "./selectedTrack";

afterEach(() => {
  act(() => setSelectedTrack(null));
});

describe("the selected-track store", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useSelectedTrack());
    expect(result.current).toBeNull();
  });

  it("holds an id and a Camelot key, or no key", () => {
    const { result } = renderHook(() => useSelectedTrack());
    act(() => setSelectedTrack({ id: 7, key: "8A" }));
    expect(result.current).toEqual({ id: 7, key: "8A" });
    act(() => setSelectedTrack({ id: "bp-9", key: null }));
    expect(result.current).toEqual({ id: "bp-9", key: null });
    act(() => setSelectedTrack(null));
    expect(result.current).toBeNull();
  });

  it("tells every reader at once", () => {
    const a = renderHook(() => useSelectedTrack());
    const b = renderHook(() => useSelectedTrack());
    act(() => setSelectedTrack({ id: 1, key: "1B" }));
    expect(a.result.current).toEqual(b.result.current);
  });

  it("does not re-render readers for an identical selection", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useSelectedTrack();
    });
    act(() => setSelectedTrack({ id: 1, key: "1B" }));
    const after = renders;
    act(() => setSelectedTrack({ id: 1, key: "1B" }));
    expect(renders).toBe(after);
    expect(getSelectedTrack()).toEqual({ id: 1, key: "1B" });
  });

  it("can be read outside React", () => {
    expect(getSelectedTrack()).toBeNull();
  });
});
