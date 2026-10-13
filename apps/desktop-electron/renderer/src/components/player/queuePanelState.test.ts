import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { closeQueue, resetQueuePanelStateForTests, setQueueOpen, toggleQueue, useQueueOpen } from "./queuePanelState";

/**
 * Whether the queue is open (R2-1, DEC-264).
 *
 * Session only (DEC-014), so there is no storage to test; what matters is that
 * everything reading it hears about a change, and that closing it puts the
 * keyboard back where the user opened it from.
 */

afterEach(() => {
  resetQueuePanelStateForTests();
  document.body.innerHTML = "";
});

function button(): HTMLButtonElement {
  const opener = document.createElement("button");
  document.body.appendChild(opener);
  return opener;
}

describe("the open state", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useQueueOpen());
    expect(result.current).toBe(false);
  });

  it("toggles open and closed", () => {
    const { result } = renderHook(() => useQueueOpen());

    act(() => toggleQueue());
    expect(result.current).toBe(true);

    act(() => toggleQueue());
    expect(result.current).toBe(false);
  });

  it("tells every reader at once", () => {
    const first = renderHook(() => useQueueOpen());
    const second = renderHook(() => useQueueOpen());

    act(() => setQueueOpen(true));

    expect(first.result.current).toBe(true);
    expect(second.result.current).toBe(true);
  });

  it("does not repaint readers when nothing changed", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useQueueOpen();
    });
    const before = renders;

    act(() => setQueueOpen(false));

    expect(renders).toBe(before);
  });
});

describe("where focus goes when it closes", () => {
  it("returns to the control that opened it", () => {
    const opener = button();
    opener.focus();
    act(() => toggleQueue());
    // Focus moves on while the panel is open, as it does when the user works in it.
    document.body.focus();
    opener.blur();

    act(() => closeQueue());

    expect(document.activeElement).toBe(opener);
  });

  it("also does when toggled shut from the same control", () => {
    const opener = button();
    opener.focus();
    act(() => toggleQueue());
    opener.blur();

    act(() => toggleQueue());

    expect(document.activeElement).toBe(opener);
  });

  it("leaves focus alone when the opener was removed", () => {
    const opener = button();
    const other = button();
    opener.focus();
    act(() => toggleQueue());
    opener.remove();
    other.focus();
    const focus = vi.spyOn(opener, "focus");

    act(() => closeQueue());

    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(other);
  });

  it("does nothing when it was already closed", () => {
    const opener = button();
    opener.focus();
    act(() => toggleQueue());
    act(() => closeQueue());
    document.body.focus();
    opener.blur();
    const focus = vi.spyOn(opener, "focus");

    act(() => closeQueue());

    expect(focus).not.toHaveBeenCalled();
  });

  it("leaves focus where the user is typing elsewhere", () => {
    const opener = button();
    const input = document.createElement("input");
    document.body.appendChild(input);
    opener.focus();
    act(() => toggleQueue());
    input.focus();

    act(() => closeQueue());

    expect(document.activeElement).toBe(input);
  });

  it("returns focus from inside the panel", () => {
    const opener = button();
    const panel = document.createElement("aside");
    panel.className = "cp-queue";
    const close = document.createElement("button");
    panel.appendChild(close);
    document.body.appendChild(panel);
    opener.focus();
    act(() => toggleQueue());
    close.focus();

    act(() => closeQueue());
    panel.remove();

    expect(document.activeElement).toBe(opener);
  });
});
