/**
 * The table's toolbar row (FLW-8, LIB-8): with nothing selected only the count and
 * Select all; with a selection the four group buttons and "3 selected ×" on the left.
 * The row is the same height either way, so the table never moves when a selection is
 * made or let go (DEC-112).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ACTION_GROUPS, type TrackActionGroup } from "./trackActions";
import { LibraryToolbar } from "./LibraryToolbar";
import { needsTwoLines } from "./toolbarLines";

function groups(reason: string | null = null): TrackActionGroup[] {
  return ACTION_GROUPS.map(({ id, label }) => ({
    id,
    label,
    items: [{ id: `${id}-entry`, label: `${label} entry`, onSelect: vi.fn() }],
    disabledReason: reason,
  }));
}

function renderBar(props: Partial<React.ComponentProps<typeof LibraryToolbar>> = {}) {
  const onOpenGroup = vi.fn();
  const onClear = vi.fn();
  const onSelectAll = vi.fn();
  render(
    <LibraryToolbar
      groups={groups()}
      total={1204}
      selected={3}
      describedByQuery={false}
      openGroup={null}
      onOpenGroup={onOpenGroup}
      onClear={onClear}
      onSelectAll={onSelectAll}
      {...props}
    />,
  );
  return { onOpenGroup, onClear, onSelectAll };
}

const NAMES = ["Play", "Organize", "Beatport", "More"];
const CLEAR = "Clear selection, 3 selected";

describe("the selection bar", () => {
  it("is a toolbar of the four groups and the selected-count button, in that order", () => {
    renderBar();
    const bar = screen.getByRole("toolbar", { name: "Selected tracks" });
    const names = within(bar)
      .getAllByRole("button")
      .map((button) => (button.textContent ?? "").replace(" ▸", ""));
    expect(names).toEqual([...NAMES, "3 selected ×"]);
  });

  it("marks every group as opening a menu", () => {
    renderBar();
    for (const name of NAMES) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-haspopup", "menu");
    }
    expect(screen.getByRole("button", { name: CLEAR })).not.toHaveAttribute("aria-haspopup");
  });

  it("shows no group buttons and no clear button while nothing is selected", () => {
    renderBar({ groups: groups("Select tracks first"), selected: 0 });
    expect(screen.queryByRole("toolbar")).toBeNull();
    for (const name of NAMES) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.queryByRole("button", { name: /Clear selection/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Select all" })).toBeInTheDocument();
  });

  it("opens a group under its button", () => {
    const { onOpenGroup } = renderBar();
    const button = screen.getByRole("button", { name: "Organize" });
    button.getBoundingClientRect = () =>
      ({ left: 40, bottom: 90, top: 60, right: 100, width: 60, height: 30 }) as DOMRect;
    fireEvent.click(button);
    expect(onOpenGroup).toHaveBeenCalledWith("organize", { x: 40, y: 90 });
  });

  it("says which group is open", () => {
    renderBar({ openGroup: "more" });
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-expanded", "false");
  });

  it("clears the selection from the 3 selected × button, moving focus to Select all first", async () => {
    const { onClear } = renderBar();
    await userEvent.click(screen.getByRole("button", { name: CLEAR }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Select all" })).toHaveFocus();
  });

  it("lands Tab on Play again when the bar comes back", async () => {
    const props = {
      groups: groups(),
      total: 10,
      describedByQuery: false,
      openGroup: null,
      onOpenGroup: vi.fn(),
      onClear: vi.fn(),
      onSelectAll: vi.fn(),
    };
    const { rerender } = render(<LibraryToolbar {...props} selected={3} />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    rerender(<LibraryToolbar {...props} selected={0} />);
    rerender(<LibraryToolbar {...props} selected={3} />);
    expect(screen.getByRole("button", { name: "Play" }).tabIndex).toBe(0);
  });

  it("says in the clear button's name when the selection is everything matching", () => {
    renderBar({ selected: 1204, describedByQuery: true });
    expect(
      screen.getByRole("button", { name: "Clear selection, 1,204 selected (everything matching)" }),
    ).toBeInTheDocument();
  });

  it("is the same height with and without a selection (DEC-112)", () => {
    const { unmount } = render(
      <LibraryToolbar
        groups={groups()}
        total={10}
        selected={0}
        describedByQuery={false}
        openGroup={null}
        onOpenGroup={vi.fn()}
        onClear={vi.fn()}
        onSelectAll={vi.fn()}
      />,
    );
    const none = document.querySelector<HTMLElement>(".library-toolbar")!.style.minHeight;
    // One line of controls plus the row's padding and rule, border-box.
    expect(none).toContain("var(--control-height)");
    expect(none).toContain("var(--hairline)");
    unmount();
    renderBar();
    expect(document.querySelector<HTMLElement>(".library-toolbar")!.style.minHeight).toBe(none);
  });
});

describe("the bar's keyboard", () => {
  it("is one Tab stop, and the arrows move between its buttons", async () => {
    renderBar();
    const bar = screen.getByRole("toolbar", { name: "Selected tracks" });
    const buttons = within(bar).getAllByRole("button");
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    expect(buttons[0]!.tabIndex).toBe(0);

    await userEvent.tab();
    expect(buttons[0]).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(buttons[1]).toHaveFocus();
    expect(buttons[1]!.tabIndex).toBe(0);
    expect(buttons[0]!.tabIndex).toBe(-1);
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    // Past the first goes round to the last.
    expect(buttons[buttons.length - 1]).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(buttons[0]).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(buttons[buttons.length - 1]).toHaveFocus();
  });

  it("opens a group on Enter and on the Down arrow", async () => {
    const { onOpenGroup } = renderBar();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(onOpenGroup).toHaveBeenLastCalledWith("play", expect.any(Object));
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    expect(onOpenGroup).toHaveBeenLastCalledWith("organize", expect.any(Object));
  });
});

describe("the count and Select all", () => {
  it("draws only the view's tracks, and tells a screen reader the selection too", () => {
    renderBar();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/^1,204 tracks, 3 tracks selected$/);
    expect(status.querySelector(".library-toolbar__sr")).not.toBeNull();
  });

  it("says only the tracks when nothing is selected", () => {
    renderBar({ selected: 0 });
    expect(screen.getByRole("status")).toHaveTextContent(/^1,204 tracks$/);
  });

  it("is singular for one", () => {
    renderBar({ total: 1, selected: 1 });
    expect(screen.getByRole("status")).toHaveTextContent(/^1 track, 1 track selected$/);
  });

  it("keeps Select all beside the count, and offers it until everything is selected (LIB-8)", async () => {
    const { onSelectAll } = renderBar({ selected: 0 });
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("keeps Select all outside the bar, which is only for selected tracks", () => {
    renderBar();
    const bar = screen.getByRole("toolbar", { name: "Selected tracks" });
    expect(within(bar).queryByRole("button", { name: "Select all" })).toBeNull();
  });

  it("does not offer Select all with nothing to select, or when all is selected", () => {
    renderBar({ total: 0, selected: 0 });
    expect(screen.queryByRole("button", { name: "Select all" })).toBeNull();
  });

  it("keeps Select all in place once every track is selected, disabled with the reason", async () => {
    const { onSelectAll } = renderBar({ total: 3, selected: 3 });
    const button = screen.getByRole("button", { name: "Select all" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("title", "Every track is selected");
    await userEvent.click(button);
    expect(onSelectAll).not.toHaveBeenCalled();
  });

  it("holds the count's own form for the ellipsis to cut", () => {
    renderBar({ total: 1204, selected: 0 });
    const reserve = document.querySelector(".library-toolbar__count-reserve");
    expect(reserve).toHaveAttribute("aria-hidden");
    expect(reserve).toHaveAttribute("data-reserve", "1,204 tracks");
  });

  it("has no Columns… button; the table's header corner has it", () => {
    renderBar();
    expect(screen.queryByRole("button", { name: "Columns…" })).toBeNull();
  });
});

describe("the count (LIB-8)", () => {
  it("says how many tracks there are", () => {
    renderBar({ selected: 0 });
    expect(screen.getByRole("status")).toHaveTextContent("1,204 tracks");
  });

  it("says Showing N of M while a search or filter narrows the view", () => {
    renderBar({ total: 240, scopeTotal: 12000, selected: 3 });
    expect(screen.getByRole("status")).toHaveTextContent("Showing 240 of 12,000 tracks");
  });

  it("is set in the data font with tabular figures (R4-3)", () => {
    renderBar({ selected: 0 });
    expect(screen.getByRole("status")).toHaveClass("cp-data");
  });

  it("goes back to the plain count when nothing is narrowed", () => {
    renderBar({ total: 12000, scopeTotal: 12000, selected: 0 });
    expect(screen.getByRole("status")).toHaveTextContent(/^12,000 tracks$/);
  });
});

describe("the two lines (DEC-217, 2026-10-09)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("are needed only when the controls and their gaps pass the room", () => {
    expect(needsTwoLines([100, 100, 100], 10, 320)).toBe(false);
    expect(needsTwoLines([100, 100, 100], 10, 319)).toBe(true);
    expect(needsTwoLines([], 10, 0)).toBe(false);
  });

  /** Every measured control `width` pixels wide, in a row `room` pixels wide. */
  function measured(width: number, room: number) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width,
    } as DOMRect);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(room);
  }

  it("take the groups first, then the selected-count button, the count and Select all", () => {
    // Seven measured controls (four groups, the selected-count button, the count's reserve,
    // Select all), measured as they would be with a selection.
    measured(50, 300);
    renderBar({ selected: 0 });
    const row = document.querySelector(".library-toolbar")!;
    expect(row).toHaveClass("library-toolbar--two-lines");
    expect(row.querySelector(".library-toolbar__end")).not.toBeNull();
  });

  it("holds an empty first line with nothing selected on two lines, so the row does not move (DEC-112)", () => {
    measured(50, 300);
    const { unmount } = render(
      <LibraryToolbar
        groups={groups()}
        total={10}
        selected={0}
        describedByQuery={false}
        openGroup={null}
        onOpenGroup={vi.fn()}
        onClear={vi.fn()}
        onSelectAll={vi.fn()}
      />,
    );
    expect(document.querySelector(".library-toolbar__spacer")).toHaveAttribute("aria-hidden");
    unmount();
    renderBar();
    expect(document.querySelector(".library-toolbar__spacer")).toBeNull();
  });

  it("measures the same with and without a selection, so selecting never flips the lines", () => {
    measured(50, 300);
    const { unmount } = render(
      <LibraryToolbar
        groups={groups()}
        total={10}
        selected={0}
        describedByQuery={false}
        openGroup={null}
        onOpenGroup={vi.fn()}
        onClear={vi.fn()}
        onSelectAll={vi.fn()}
      />,
    );
    const without = document.querySelector(".library-toolbar")!.className;
    unmount();
    renderBar();
    expect(document.querySelector(".library-toolbar")!.className).toBe(without);
  });

  it("are one line when everything fits", () => {
    measured(50, 2000);
    renderBar();
    expect(document.querySelector(".library-toolbar")).not.toHaveClass("library-toolbar--two-lines");
  });

  it("never apply to the one-line bars of Discover and Similar", () => {
    measured(50, 400);
    renderBar({ oneLine: true });
    const row = document.querySelector(".library-toolbar")!;
    expect(row).toHaveClass("library-toolbar--one-line");
    expect(row).not.toHaveClass("library-toolbar--two-lines");
  });
});
