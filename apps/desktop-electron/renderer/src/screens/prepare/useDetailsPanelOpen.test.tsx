/**
 * Whether the shell's Track details panel is on screen (C226): the page cannot ask the shell, so
 * it looks for the panel's own element, which exists only while the panel is open.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DETAILS_PANEL_ID } from "../../components/shell/detailsToggle";
import { useDetailsPanelOpen } from "./useDetailsPanelOpen";

afterEach(() => {
  document.getElementById(DETAILS_PANEL_ID)?.remove();
});

function panel() {
  const element = document.createElement("aside");
  element.id = DETAILS_PANEL_ID;
  return element;
}

describe("useDetailsPanelOpen", () => {
  it("is false with no panel, true while it is mounted, and false again once it is gone", async () => {
    const { result } = renderHook(() => useDetailsPanelOpen());
    expect(result.current).toBe(false);
    const element = panel();
    await act(async () => {
      document.body.appendChild(element);
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
    await act(async () => {
      element.remove();
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
  });

  it("is true at once when the panel is already open", () => {
    document.body.appendChild(panel());
    const { result } = renderHook(() => useDetailsPanelOpen());
    expect(result.current).toBe(true);
  });
});
