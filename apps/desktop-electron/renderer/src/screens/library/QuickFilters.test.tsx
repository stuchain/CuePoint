import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    const button = screen.getByRole("button", { name: /^Filters/ });
    expect(button).toHaveAttribute("aria-pressed", "true");
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
