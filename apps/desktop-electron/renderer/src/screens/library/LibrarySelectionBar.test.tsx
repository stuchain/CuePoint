/**
 * The Library's selection bar (C9, C215): the shared SelectionBar with the four group buttons as its
 * actions. It is drawn only while something is selected; Select all is in the bar (M116); the
 * count is in the filter row.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ACTION_GROUPS, type TrackActionGroup } from "./trackActions";
import { LibrarySelectionBar } from "./LibrarySelectionBar";
import { expectNoAxeViolations } from "../../test/axe";

function groups(reason: string | null = null): TrackActionGroup[] {
  return ACTION_GROUPS.map(({ id, label }) => ({
    id,
    label,
    items: [{ id: `${id}-entry`, label: `${label} entry`, onSelect: vi.fn() }],
    disabledReason: reason,
  }));
}

function renderBar(props: Partial<React.ComponentProps<typeof LibrarySelectionBar>> = {}) {
  const onOpenGroup = vi.fn();
  const onClear = vi.fn();
  const view = render(
    <LibrarySelectionBar
      groups={groups()}
      selected={3}
      describedByQuery={false}
      openGroup={null}
      onOpenGroup={onOpenGroup}
      onClear={onClear}
      {...props}
    />,
  );
  return { onOpenGroup, onClear, ...view };
}

const NAMES = ["Play", "Organize", "Beatport", "More"];

describe("the Library's selection bar", () => {
  it("draws nothing while nothing is selected", () => {
    renderBar({ selected: 0 });
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("is the shared selection bar, saying how many and clearing with its close button", async () => {
    const { onClear } = renderBar();
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    expect(bar).toHaveClass("cp-selection-bar");
    expect(bar).toHaveTextContent("3 selected");
    await userEvent.click(within(bar).getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("offers Select all with the total, until every track is selected (M116)", async () => {
    const onSelectAll = vi.fn();
    const { rerender } = renderBar({ selectAll: { total: 300, onSelectAll } });
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    await userEvent.click(within(bar).getByRole("button", { name: "Select all 300" }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
    rerender(
      <LibrarySelectionBar
        groups={groups()}
        selected={300}
        describedByQuery
        openGroup={null}
        onOpenGroup={vi.fn()}
        onClear={vi.fn()}
        selectAll={{ total: 300, onSelectAll }}
      />,
    );
    expect(within(bar).queryByRole("button", { name: /^Select all/ })).toBeNull();
  });

  it("holds the four groups as grey menu buttons", () => {
    renderBar();
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    for (const name of NAMES) {
      const button = within(bar).getByRole("button", { name });
      expect(button).toHaveAttribute("aria-haspopup", "menu");
      expect(button).toHaveClass("cp-btn--secondary");
    }
  });

  it("opens a group under its button, and says which one is open", async () => {
    const { onOpenGroup } = renderBar({ openGroup: "more" });
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "true");
    const button = screen.getByRole("button", { name: "Organize" });
    button.getBoundingClientRect = () =>
      ({ left: 40, bottom: 90, top: 60, right: 100, width: 60, height: 30 }) as DOMRect;
    const barRoot = button.closest<HTMLElement>(".cp-selection-bar")!;
    barRoot.getBoundingClientRect = () =>
      ({ left: 0, bottom: 100, top: 52, right: 600, width: 600, height: 48 }) as DOMRect;
    await userEvent.click(button);
    // M290: the bar's top edge goes with it, so the menu opens above the bar, not the button.
    expect(onOpenGroup).toHaveBeenCalledWith("organize", { x: 40, y: 90, above: 52 }, undefined);
  });

  it("keeps a disabled group reachable and gives no menu for it", async () => {
    const { onOpenGroup } = renderBar({ groups: groups("Select tracks first") });
    const button = screen.getByRole("button", { name: "Play" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(onOpenGroup).not.toHaveBeenCalled();
  });

  it("says in a status that the selection is everything matching", () => {
    renderBar({ selected: 1204, describedByQuery: true });
    expect(screen.getByRole("status")).toHaveTextContent("The selection is everything matching");
  });

  it("is one Tab stop on the groups, the arrows move between them, Down opens", async () => {
    const { onOpenGroup } = renderBar();
    const stops = NAMES.map((name) => screen.getByRole("button", { name }));
    expect(stops.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    // The close button comes first, then the groups' one stop.
    await userEvent.tab();
    await userEvent.tab();
    expect(stops[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(stops[1]).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onOpenGroup).toHaveBeenLastCalledWith("organize", expect.any(Object), undefined);
    await userEvent.keyboard("{End}");
    expect(stops[3]).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(stops[0]).toHaveFocus();
  });

  it("lands Tab on Play again when the bar comes back", async () => {
    const props = {
      groups: groups(),
      describedByQuery: false,
      openGroup: null,
      onOpenGroup: vi.fn(),
      onClear: vi.fn(),
    };
    const { rerender } = render(<LibrarySelectionBar {...props} selected={3} />);
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    rerender(<LibrarySelectionBar {...props} selected={0} />);
    rerender(<LibrarySelectionBar {...props} selected={3} />);
    expect(screen.getByRole("button", { name: "Play" }).tabIndex).toBe(0);
  });
});

describe("LibrarySelectionBar accessibility (HARDEN-08)", () => {
  it("is a named toolbar with no WCAG 2.2 A or AA violations", async () => {
    renderBar();
    expect(screen.getByRole("toolbar", { name: "Selection" })).toBeInTheDocument();
    await expectNoAxeViolations();
  });
});
