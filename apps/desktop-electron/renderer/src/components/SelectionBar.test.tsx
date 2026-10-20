import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SelectAllButton, SelectionBar } from "./SelectionBar";
import css from "./SelectionBar.css?raw";
import { DOUBLE_CLICK_MS } from "../hooks/useDoubleClickGrace";

describe("SelectionBar (C9, C215)", () => {
  it("is not drawn when nothing is selected", () => {
    const { container } = render(<SelectionBar count={0} onClear={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says how many are selected, with a small close button that clears them", async () => {
    const onClear = vi.fn();
    render(<SelectionBar count={3} onClear={onClear} />);
    expect(screen.getByRole("toolbar", { name: "Selection" })).toHaveTextContent("3 selected");
    const clear = screen.getByRole("button", { name: "Clear selection" });
    expect(clear).toHaveClass("cp-btn--sm");
    expect(clear).toHaveAttribute("title", "Clear selection");
    await userEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("groups the count with the thousands separator of the locale", () => {
    render(<SelectionBar count={1234} onClear={() => {}} locale="en-US" />);
    expect(screen.getByText("1,234 selected")).toBeInTheDocument();
  });

  it("puts the page's actions on the right", () => {
    render(
      <SelectionBar count={2} onClear={() => {}}>
        <button type="button">Add to queue</button>
      </SelectionBar>,
    );
    const actions = screen.getByRole("button", { name: "Add to queue" }).closest(".cp-selection-bar__actions");
    expect(actions).not.toBeNull();
  });

  it("is 42 high at 1x and scales, on the toolbar colour, with no border of its own", () => {
    expect(css).toMatch(/--selection-bar-height:\s*round\(nearest, calc\(42px \* var\(--scale\)\), 1px\)/);
    expect(css).toMatch(/\.cp-selection-bar\s*\{[^}]*min-height:\s*var\(--selection-bar-height\)/);
    expect(css).toMatch(/\.cp-selection-bar\s*\{[^}]*background:\s*var\(--bg-toolbar\)/);
  });
});

describe("SelectionBar over a table (option 1A)", () => {
  it("lets the pointer through for a double-click's length after it appears, then takes clicks", () => {
    vi.useFakeTimers();
    try {
      render(<SelectionBar count={1} onClear={() => {}} overlay />);
      const bar = screen.getByRole("toolbar", { name: "Selection" });
      expect(bar).toHaveClass("cp-selection-bar--overlay");
      expect(bar).toHaveAttribute("data-armed", "false");
      act(() => void vi.advanceTimersByTime(DOUBLE_CLICK_MS - 1));
      expect(bar).toHaveAttribute("data-armed", "false");
      act(() => void vi.advanceTimersByTime(1));
      expect(bar).not.toHaveAttribute("data-armed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("is drawn with a hairline rule on top and no shadow, and lets the pointer through while unarmed", () => {
    expect(css).toMatch(/\.cp-selection-bar--overlay\s*\{[^}]*border-top:\s*var\(--divider\)/);
    expect(css).not.toMatch(/box-shadow/);
    expect(css).toMatch(/\.cp-selection-bar--overlay\[data-armed="false"\]\s*\{[^}]*pointer-events:\s*none/);
  });

  it("in the flow, never holds the pointer back", () => {
    render(<SelectionBar count={1} onClear={() => {}} />);
    expect(screen.getByRole("toolbar", { name: "Selection" })).not.toHaveAttribute("data-armed");
  });
});

describe("SelectAllButton", () => {
  it("is a quiet button that selects everything", async () => {
    const onSelectAll = vi.fn();
    render(<SelectAllButton onSelectAll={onSelectAll} />);
    const button = screen.getByRole("button", { name: "Select all" });
    expect(button).toHaveClass("cp-btn--quiet");
    await userEvent.click(button);
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("can be greyed", () => {
    render(<SelectAllButton onSelectAll={() => {}} disabled />);
    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
  });
});
