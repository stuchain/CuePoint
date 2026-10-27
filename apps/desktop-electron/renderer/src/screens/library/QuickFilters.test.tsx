import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLayerStack } from "../../hooks/useLayerStack";
import { QuickFilters } from "./QuickFilters";
import { BPM_FIELD } from "./quickFilterRules";

describe("QuickFilters folded (W1)", () => {
  it("names Key, BPM and Genre in one Filters menu, with the row's other actions after them", () => {
    const extra = vi.fn();
    render(
      <QuickFilters
        filters={{ match: "all", rules: [{ field: BPM_FIELD, operator: "between", value: [120, 128] }] }}
        onFiltersChange={() => {}}
        facets={null}
        onOpen={() => {}}
        folded
        extraItems={[{ id: "select-all", label: "Select all", onSelect: extra }]}
      />,
    );
    expect(screen.queryByRole("button", { name: /^BPM/ })).toBeNull();
    // M470: the count is in the name, and the button is a menu button, not a toggle.
    const button = screen.getByRole("button", { name: "Filters, 1 chosen" });
    expect(button).not.toHaveAttribute("aria-pressed");
    fireEvent.click(button);
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["Key", "BPM (1)", "Genre", "Select all"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Select all" }));
    expect(extra).toHaveBeenCalledOnce();
  });

  it("opens the chosen filter's panel under the Filters button", () => {
    const onOpen = vi.fn();
    render(<QuickFilters filters={null} onFiltersChange={() => {}} facets={null} onOpen={onOpen} folded />);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "BPM" }));
    expect(screen.getByRole("dialog", { name: "BPM" })).toBeInTheDocument();
    expect(onOpen).toHaveBeenCalled();
  });
});

/** Another open layer, opened after the list: a menu or a dialog over it. */
function OverLayer() {
  useLayerStack(true);
  return null;
}

describe("QuickFilters' list and the other layers (M469, M470)", () => {
  it("leaves Escape to a layer opened over it, then closes on the next one", () => {
    render(<QuickFilters filters={null} onFiltersChange={() => {}} facets={null} onOpen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Key" }));
    expect(screen.getByRole("dialog", { name: "Key" })).toBeInTheDocument();

    const over = render(<OverLayer />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Key" })).toBeInTheDocument();

    over.unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Key" })).toBeNull();
  });

  it("is a menu button that says it is open, with the count in its name", () => {
    render(
      <QuickFilters
        filters={{ match: "all", rules: [{ field: BPM_FIELD, operator: "between", value: [120, 128] }] }}
        onFiltersChange={() => {}}
        facets={null}
        onOpen={() => {}}
      />,
    );
    const bpm = screen.getByRole("button", { name: "BPM, 1 chosen" });
    expect(bpm).not.toHaveAttribute("aria-pressed");
    expect(bpm).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(bpm);
    expect(bpm).toHaveAttribute("aria-expanded", "true");
  });
});
