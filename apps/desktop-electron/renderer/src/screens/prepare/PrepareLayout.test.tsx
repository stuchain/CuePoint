/**
 * The Prepare page's two panes (PREP-10, DEC-112): the Set, and beside it the
 * source panel with a divider whose width is remembered. Without a source
 * panel the Set takes the width and there is no divider to move.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { PrepareLayout } from "./PrepareLayout";
import { SOURCE_DEFAULT_WIDTH, SOURCE_MIN_WIDTH, SOURCE_WIDTH_STORAGE_KEY } from "./prepareLayoutState";

afterEach(() => localStorage.clear());

function divider() {
  return screen.getByRole("separator", { name: "Resize the source panel" });
}

describe("the layout", () => {
  it("gives the Set the width, with no divider, when there is no source panel", () => {
    render(<PrepareLayout set={<p>the set</p>} />);
    expect(screen.getByText("the set")).toBeInTheDocument();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("puts the source panel beside the Set, at the remembered width", () => {
    localStorage.setItem(SOURCE_WIDTH_STORAGE_KEY, "400");
    const { container } = render(<PrepareLayout set={<p>the set</p>} source={<p>the source</p>} />);
    expect(screen.getByText("the source")).toBeInTheDocument();
    expect(divider()).toHaveAttribute("aria-valuenow", "400");
    const layout = container.querySelector(".prepare-layout") as HTMLElement;
    expect(layout.style.getPropertyValue("--prepare-source-width")).toBe("400px");
  });

  it("moves with the arrow keys and remembers where it was left", () => {
    render(<PrepareLayout set={<p>the set</p>} source={<p>the source</p>} />);
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_DEFAULT_WIDTH));
    fireEvent.keyDown(divider(), { key: "ArrowLeft" });
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_DEFAULT_WIDTH + 16));
    fireEvent.keyDown(divider(), { key: "ArrowRight" });
    fireEvent.keyDown(divider(), { key: "ArrowRight" });
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_DEFAULT_WIDTH - 16));
    expect(localStorage.getItem(SOURCE_WIDTH_STORAGE_KEY)).toBe(String(SOURCE_DEFAULT_WIDTH - 16));
  });

  it("keeps the Set the wider pane, against the layout's own width, not the window's (PREP-11)", () => {
    // The window is 1,200 wide here; with the sidebar and the Inspector open
    // the two panes share far less. A remembered 500 is clamped to 45% of it.
    localStorage.setItem(SOURCE_WIDTH_STORAGE_KEY, "500");
    const spy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(620);
    try {
      render(<PrepareLayout set={<p>the set</p>} source={<p>the source</p>} />);
      expect(divider()).toHaveAttribute("aria-valuenow", String(Math.floor(620 * 0.45)));
      // Remembered as chosen, so a wider layout gives it back.
      expect(localStorage.getItem(SOURCE_WIDTH_STORAGE_KEY)).toBe("500");
    } finally {
      spy.mockRestore();
    }
  });

  it("follows a drag of the divider, never below the source panel's floor", () => {
    render(<PrepareLayout set={<p>the set</p>} source={<p>the source</p>} />);
    fireEvent.mouseDown(divider(), { clientX: 800 });
    fireEvent.mouseMove(window, { clientX: 760 });
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_DEFAULT_WIDTH + 40));
    fireEvent.mouseMove(window, { clientX: 1200 });
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_MIN_WIDTH));
    fireEvent.mouseUp(window);
    fireEvent.mouseMove(window, { clientX: 100 });
    expect(divider()).toHaveAttribute("aria-valuenow", String(SOURCE_MIN_WIDTH));
    expect(document.body.classList.contains("prepare-resizing")).toBe(false);
  });
});
