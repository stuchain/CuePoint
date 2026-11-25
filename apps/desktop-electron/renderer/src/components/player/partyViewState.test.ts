import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { closePartyView, resetPartyViewStateForTests, setPartyViewOpen, togglePartyView, usePartyViewOpen } from "./partyViewState";

/** Whether the Party view is open: session only, one value read by the bar's button and the overlay. */
afterEach(() => {
  resetPartyViewStateForTests();
  document.body.innerHTML = "";
});

describe("the Party view's open state", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => usePartyViewOpen());
    expect(result.current).toBe(false);
  });

  it("toggles open and closed, and every reader hears of it", () => {
    const a = renderHook(() => usePartyViewOpen());
    const b = renderHook(() => usePartyViewOpen());
    act(() => togglePartyView());
    expect(a.result.current).toBe(true);
    expect(b.result.current).toBe(true);
    act(() => togglePartyView());
    expect(a.result.current).toBe(false);
  });

  it("closes, and closing a closed view changes nothing", () => {
    const { result } = renderHook(() => usePartyViewOpen());
    act(() => setPartyViewOpen(true));
    act(() => closePartyView());
    expect(result.current).toBe(false);
    act(() => closePartyView());
    expect(result.current).toBe(false);
  });

  it("puts focus back on what opened it when focus was lost with the overlay", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    act(() => setPartyViewOpen(true));
    const inside = document.createElement("button");
    inside.className = "cp-party";
    document.body.appendChild(inside);
    inside.focus();
    inside.remove();
    act(() => closePartyView());
    expect(document.activeElement).toBe(opener);
  });
});
