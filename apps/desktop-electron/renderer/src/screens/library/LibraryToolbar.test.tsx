/**
 * The table's toolbar row (FLW-8, LIB-8, LIB-10): the selection bar on the
 * left; the count and Columns… on the right. One row, always present, so the
 * table never moves when a selection is made or let go.
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
  const onColumns = vi.fn();
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
      onColumns={onColumns}
      {...props}
    />,
  );
  return { onOpenGroup, onClear, onColumns, onSelectAll };
}

const NAMES = ["Play", "Organize", "Explore", "Beatport", "Fix", "More"];

describe("the selection bar", () => {
  it("is a toolbar of the six groups and Clear selection, in that order", () => {
    renderBar();
    const bar = screen.getByRole("toolbar", { name: "Selected tracks" });
    const names = within(bar)
      .getAllByRole("button")
      .map((button) => (button.textContent ?? "").replace(" ▸", ""));
    expect(names).toEqual([...NAMES, "Clear selection"]);
  });

  it("marks every group as opening a menu", () => {
    renderBar();
    for (const name of NAMES) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-haspopup", "menu");
    }
    expect(screen.getByRole("button", { name: "Clear selection" })).not.toHaveAttribute(
      "aria-haspopup",
    );
  });

  it("is always there, disabled with the reason while nothing is selected", () => {
    renderBar({ groups: groups("Select tracks first"), selected: 0 });
    const bar = screen.getByRole("toolbar", { name: "Selected tracks" });
    for (const name of NAMES) {
      const button = within(bar).getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAttribute("title", "Select tracks first");
    }
    expect(within(bar).getByRole("button", { name: "Clear selection" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("does nothing when a disabled group is clicked", async () => {
    const { onOpenGroup, onClear } = renderBar({ groups: groups("Select tracks first"), selected: 0 });
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onOpenGroup).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
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
    renderBar({ openGroup: "fix" });
    expect(screen.getByRole("button", { name: "Fix" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-expanded", "false");
  });

  it("clears the selection", async () => {
    const { onClear } = renderBar();
    await userEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledTimes(1);
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

  it("moves through disabled buttons too, so the reason can be read", async () => {
    renderBar({ groups: groups("Select tracks first"), selected: 0 });
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Play" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Organize" })).toHaveFocus();
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

describe("the count and Columns…", () => {
  it("reads the view's tracks and the selection together", () => {
    renderBar();
    expect(screen.getByRole("status")).toHaveTextContent("1,204 tracks · 3 selected");
  });

  it("says only the tracks when nothing is selected", () => {
    renderBar({ selected: 0 });
    expect(screen.getByRole("status")).toHaveTextContent(/^1,204 tracks$/);
  });

  it("is singular for one", () => {
    renderBar({ total: 1, selected: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("1 track · 1 selected");
  });

  it("says when the selection is everything matching", () => {
    renderBar({ selected: 1204, describedByQuery: true });
    expect(screen.getByRole("status")).toHaveTextContent("1,204 selected (everything matching)");
  });

  it("keeps Select all beside the count, and offers it until everything is selected (LIB-8)", async () => {
    const { onSelectAll } = renderBar({ selected: 0 });
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
    expect(
      within(screen.getByRole("toolbar", { name: "Selected tracks" })).queryByRole("button", {
        name: "Select all",
      }),
    ).toBeNull();
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

  it("holds the count's longest form, so a first selection does not lengthen the line (DEC-112)", () => {
    renderBar({ total: 1204, selected: 0 });
    const reserve = document.querySelector(".library-toolbar__count-reserve");
    expect(reserve).toHaveAttribute("aria-hidden");
    expect(reserve).toHaveAttribute("data-reserve", "1,204 tracks · 1,204 selected");
    expect(screen.getByRole("status")).toHaveTextContent(/^1,204 tracks$/);
  });

  it("opens the column list", async () => {
    const { onColumns } = renderBar();
    await userEvent.click(screen.getByRole("button", { name: "Columns…" }));
    expect(onColumns).toHaveBeenCalledTimes(1);
  });

  it("keeps Columns… outside the bar, which is only for selected tracks", () => {
    renderBar();
    const bar = screen.getByRole("toolbar", { name: "Selected tracks" });
    expect(within(bar).queryByRole("button", { name: "Columns…" })).toBeNull();
  });
});

describe("the count (LIB-8)", () => {
  it("says how many tracks there are", () => {
    renderBar({ selected: 0 });
    expect(screen.getByRole("status")).toHaveTextContent("1,204 tracks");
  });

  it("says Showing N of M while a search or filter narrows the view", () => {
    renderBar({ total: 240, scopeTotal: 12000, selected: 3 });
    expect(screen.getByRole("status")).toHaveTextContent("Showing 240 of 12,000 tracks · 3 selected");
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

  it("take the six groups first, then Clear selection, the count, Select all and Columns…", () => {
    // Ten controls (seven bar buttons, Select all, Columns…, the count's reserve).
    measured(50, 400);
    renderBar();
    const row = document.querySelector(".library-toolbar")!;
    expect(row).toHaveClass("library-toolbar--two-lines");
    // The second line's controls are ordered after the break, and only they are.
    expect(screen.getByRole("button", { name: "Clear selection" })).toHaveClass("library-toolbar__clear");
    expect(row.querySelector(".library-toolbar__end")).not.toBeNull();
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

  it("do not change on a first selection: the count's reserve already holds its longest form", () => {
    // What the row measures for the count is its reserve, and a selection leaves it as it was.
    const { rerender } = render(
      <LibraryToolbar
        groups={groups("Select tracks first")}
        total={1204}
        selected={0}
        describedByQuery={false}
        openGroup={null}
        onOpenGroup={vi.fn()}
        onClear={vi.fn()}
        onSelectAll={vi.fn()}
        onColumns={vi.fn()}
      />,
    );
    const before = document.querySelector<HTMLElement>(".library-toolbar__count-reserve")!.dataset.reserve;
    rerender(
      <LibraryToolbar
        groups={groups()}
        total={1204}
        selected={1}
        describedByQuery={false}
        openGroup={null}
        onOpenGroup={vi.fn()}
        onClear={vi.fn()}
        onSelectAll={vi.fn()}
        onColumns={vi.fn()}
      />,
    );
    expect(document.querySelector<HTMLElement>(".library-toolbar__count-reserve")!.dataset.reserve).toBe(before);
    expect(before).toBe("1,204 tracks · 1,204 selected");
  });
});
