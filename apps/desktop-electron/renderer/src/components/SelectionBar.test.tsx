import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SelectAllButton, SelectionBar } from "./SelectionBar";
import css from "./SelectionBar.css?raw";

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
    expect(css).toMatch(/\.cp-selection-bar\s*\{[^}]*min-height:\s*round\(nearest, calc\(42px \* var\(--scale\)\), 1px\)/);
    expect(css).toMatch(/\.cp-selection-bar\s*\{[^}]*background:\s*var\(--bg-toolbar\)/);
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
