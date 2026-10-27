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

  // P52: the bar is the toolbar height (32 at 1x), not 42; over rows it lifts with the sticky shadow, not a divider.
  it("is the toolbar height and scales, on the toolbar colour, with no border of its own", () => {
    expect(css).toMatch(/--selection-bar-height:\s*var\(--toolbar-height\)/);
    expect(css).toMatch(/\.cp-selection-bar--overlay\s*\{[^}]*box-shadow:[^;]*calc\(-1 \* var\(--hairline\)\)/);
    expect(css).not.toMatch(/\.cp-selection-bar--overlay\s*\{[^}]*border-top/);
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

  // P52: the overlay bar lifts with the sticky shadow mirrored upward instead of a hairline rule on top.
  it("is drawn with an upward shadow and no rule, and lets the pointer through while unarmed", () => {
    expect(css).toMatch(/\.cp-selection-bar--overlay\s*\{[^}]*box-shadow:/);
    expect(css).not.toMatch(/border-top/);
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

describe("SelectionBar look (M20, M54, M56, M117)", () => {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("sets the count in the control face at the control weight, like the buttons beside it (M20)", () => {
    expect(flat).toMatch(/\.cp-selection-bar__count \{[^}]*font-family:\s*var\(--font-control\)/);
    expect(flat).toMatch(/\.cp-selection-bar__count \{[^}]*font-weight:\s*var\(--control-font-weight\)/);
    expect(flat).not.toMatch(/font-weight:\s*var\(--font-weight-semibold\)/);
  });

  it("starts the count on the cell inset and ends the last button on the rows' end inset (M54, M56)", () => {
    expect(flat).toMatch(/\.cp-selection-bar \{[^}]*padding-inline:\s*var\(--space-sm\) var\(--row-end-inset\)/);
  });

  it("lifts off the rows with a hard hairline, not a blur (M117, D4)", () => {
    expect(flat).toMatch(/\.cp-selection-bar--overlay \{[^}]*box-shadow:\s*0 calc\(-1 \* var\(--hairline\)\) 0 var\(--row-line\);/);
  });
});
