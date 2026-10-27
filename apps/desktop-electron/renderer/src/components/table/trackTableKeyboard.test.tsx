/**
 * Selecting rows from the keyboard (keyboard row selection).
 *
 * The table owns a cursor and reports every move as the click the same move
 * would have been (`onSelect(row, index, modifiers)`); the screens' selection
 * hooks need no new vocabulary. jsdom lays nothing out, so the viewport is
 * supplied as the other table tests supply it, with a taller client height so a
 * page is more than one row.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { TrackTable } from "./TrackTable";
import { inMemorySource, pendingSource, type TrackTableSource } from "./trackTableSource";
import type { TrackColumnDef } from "./trackTableLayout";

interface Row {
  id: number;
  title: string;
}

const COLUMNS: TrackColumnDef<Row>[] = [{ id: "title", header: "Title", render: (r) => r.title }];
const rows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: i + 1, title: `Row ${i + 1}` }));

beforeEach(() => {
  localStorage.setItem("cuepoint-ui-lab-scale", "1");
});

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("track-table__header") ? 30 : 400;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 400 });
  Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, value: vi.fn() });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  Reflect.deleteProperty(Element.prototype, "scrollTo");
});

type Props = Partial<Parameters<typeof TrackTable<Row>>[0]>;

function tree(props: Props) {
  return (
    <ScaleProvider>
      <TrackTable<Row>
        columns={COLUMNS}
        source={inMemorySource(rows(40))}
        getRowKey={(r) => r.id}
        ariaLabel="Rows"
        {...props}
      />
    </ScaleProvider>
  );
}

function draw(props: Props = {}) {
  const onSelect = props.onSelect ?? vi.fn();
  const view = render(tree({ ...props, onSelect }));
  const table = screen.getByRole("grid", { name: "Rows" });
  table.focus();
  return { ...view, table, onSelect: onSelect as ReturnType<typeof vi.fn>, again: (next: Props) => view.rerender(tree({ onSelect, ...next })) };
}

const PLAIN = { shiftKey: false, ctrlKey: false, metaKey: false };
const SHIFT = { shiftKey: true, ctrlKey: false, metaKey: false };

function lastCall(onSelect: ReturnType<typeof vi.fn>) {
  const call = onSelect.mock.calls.at(-1)!;
  return { title: (call[0] as Row).title, index: call[1] as number, modifiers: call[2] };
}

describe("moving the selection with the arrow keys", () => {
  it("Down with no active row selects the first", () => {
    const { table, onSelect } = draw();
    fireEvent.keyDown(table, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ title: "Row 1" });
    expect(onSelect.mock.calls[0]![1]).toBe(0);
    expect(onSelect.mock.calls[0]![2]).toEqual(PLAIN);
  });

  it("starts from the active row when there is one", () => {
    const { table, onSelect } = draw({ activeIndex: 2 });
    fireEvent.keyDown(table, { key: "ArrowDown" });
    expect(lastCall(onSelect)).toMatchObject({ index: 3, title: "Row 4", modifiers: PLAIN });
  });

  it("keeps walking from its own cursor while the screen's anchor holds still", () => {
    // Shift keeps the selection's anchor where it was; the cursor must not stick to it.
    const { table, onSelect } = draw({ activeIndex: 1 });
    fireEvent.keyDown(table, { key: "ArrowDown", shiftKey: true });
    expect(lastCall(onSelect)).toMatchObject({ index: 2, modifiers: SHIFT });
    fireEvent.keyDown(table, { key: "ArrowDown", shiftKey: true });
    expect(lastCall(onSelect)).toMatchObject({ index: 3, modifiers: SHIFT });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("does not report a move off the top", () => {
    const { table, onSelect } = draw();
    fireEvent.keyDown(table, { key: "ArrowDown" });
    fireEvent.keyDown(table, { key: "ArrowUp" });
    onSelect.mockClear();
    fireEvent.keyDown(table, { key: "ArrowUp" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("prevents the browser's own scroll for a key it handles, even at the edge", () => {
    const { table } = draw({ activeIndex: 0 });
    expect(fireEvent.keyDown(table, { key: "ArrowUp" })).toBe(false);
  });
});

describe("jumping", () => {
  it("Home and End go to the first and last row", () => {
    const { table, onSelect } = draw({ activeIndex: 10 });
    fireEvent.keyDown(table, { key: "End" });
    expect(lastCall(onSelect)).toMatchObject({ index: 39, title: "Row 40", modifiers: PLAIN });
    fireEvent.keyDown(table, { key: "Home" });
    expect(lastCall(onSelect)).toMatchObject({ index: 0, modifiers: PLAIN });
  });

  it("Shift+End extends to the last row", () => {
    const { table, onSelect } = draw({ activeIndex: 10 });
    fireEvent.keyDown(table, { key: "End", shiftKey: true });
    expect(lastCall(onSelect)).toMatchObject({ index: 39, modifiers: SHIFT });
  });

  it("PageDown and PageUp move by a page, less one row", () => {
    // 400px viewport, 30px header, 10 rows would fit at 36px: whatever the row height, a page is
    // more than one row and less than the viewport.
    const { table, onSelect } = draw();
    fireEvent.keyDown(table, { key: "PageDown" });
    const first = lastCall(onSelect).index;
    expect(first).toBeGreaterThan(1);
    expect(first).toBeLessThan(15);
    fireEvent.keyDown(table, { key: "PageUp" });
    expect(lastCall(onSelect).index).toBeLessThan(first);
  });
});

describe("keys that are not the table's", () => {
  it("M461 (D34): Ctrl+Down and Ctrl+Up move the cursor without selecting, and Ctrl+Space then ticks the row", () => {
    const { table, onSelect } = draw({ activeIndex: 1 });
    // Not prevented would let the page scroll; they are the table's now.
    expect(fireEvent.keyDown(table, { key: "ArrowDown", ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(table, { key: "ArrowDown", ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(table, { key: "ArrowUp", ctrlKey: true })).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
    // The cursor is on the row after the first (index 2), the ring is drawn there, and Ctrl+Space ticks it.
    expect(document.querySelector(".track-table__row--cursor")?.getAttribute("data-index")).toBe("2");
    fireEvent.keyDown(table, { key: " ", ctrlKey: true });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), 2, { shiftKey: false, ctrlKey: true, metaKey: false });
  });

  it("ignores Alt+Down, Left, Right, plain Space and Escape without preventing them", () => {
    const { table, onSelect } = draw({ activeIndex: 1 });
    for (const init of [
      { key: "ArrowDown", altKey: true },
      { key: "ArrowLeft" },
      { key: "ArrowRight" },
      { key: " " },
      { key: "Escape" },
    ]) {
      expect(fireEvent.keyDown(table, init)).toBe(true);
    }
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ignores a key pressed on a control inside a row", () => {
    const withButton: TrackColumnDef<Row>[] = [
      { id: "title", header: "Title", render: (r) => <button type="button">Open {r.id}</button> },
    ];
    const { onSelect } = draw({ columns: withButton });
    const button = screen.getByRole("button", { name: "Open 1" });
    button.focus();
    expect(fireEvent.keyDown(button, { key: "ArrowDown" })).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("is switched off by keyboardNavigation={false}, leaving the key to its owner", () => {
    const { table, onSelect } = draw({ keyboardNavigation: false, activeIndex: 1 });
    expect(fireEvent.keyDown(table, { key: "ArrowDown" })).toBe(true);
    expect(fireEvent.keyDown(table, { key: "End" })).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("select all and toggle", () => {
  it("Ctrl+A calls onSelectAll and prevents the page's own select-all", () => {
    const onSelectAll = vi.fn();
    const { table } = draw({ onSelectAll });
    expect(fireEvent.keyDown(table, { key: "a", ctrlKey: true })).toBe(false);
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+A with no onSelectAll is left alone", () => {
    const { table, onSelect } = draw();
    expect(fireEvent.keyDown(table, { key: "a", ctrlKey: true })).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+A is not select all", () => {
    const onSelectAll = vi.fn();
    const { table } = draw({ onSelectAll });
    fireEvent.keyDown(table, { key: "A", ctrlKey: true, shiftKey: true });
    expect(onSelectAll).not.toHaveBeenCalled();
  });

  it("Ctrl+Space toggles the cursor row as a Ctrl-click would", () => {
    const { table, onSelect } = draw({ activeIndex: 4 });
    fireEvent.keyDown(table, { key: " ", ctrlKey: true });
    expect(lastCall(onSelect)).toMatchObject({
      index: 4,
      modifiers: { shiftKey: false, ctrlKey: true, metaKey: false },
    });
  });
});

describe("the cursor", () => {
  it("is what Enter plays after the keys have moved it", () => {
    const onRowActivate = vi.fn();
    const { table } = draw({ activeIndex: 1, onRowActivate });
    fireEvent.keyDown(table, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(table, { key: "Enter" });
    expect(onRowActivate).toHaveBeenCalledWith(expect.objectContaining({ title: "Row 3" }), 2);
  });

  it("still plays the active row when no key has moved it", () => {
    const onRowActivate = vi.fn();
    const { table } = draw({ activeIndex: 5, onRowActivate });
    fireEvent.keyDown(table, { key: "Enter" });
    expect(onRowActivate).toHaveBeenCalledWith(expect.objectContaining({ title: "Row 6" }), 5);
  });

  it("follows the screen's active row when that changes", () => {
    const { table, onSelect, again } = draw({ activeIndex: 1 });
    fireEvent.keyDown(table, { key: "ArrowDown", shiftKey: true });
    again({ activeIndex: 10 });
    fireEvent.keyDown(table, { key: "ArrowDown" });
    expect(lastCall(onSelect).index).toBe(11);
  });

  it("stays where a key put it when the screen's active row jumps as a result", () => {
    // Prepare's active row snaps to a chapter heading or back to the anchor after a key.
    const onSelect = vi.fn();
    function Screen() {
      const [active, setActive] = useState<number | null>(1);
      return tree({
        activeIndex: active,
        onSelect: (...args) => {
          onSelect(...args);
          setActive(0);
        },
      });
    }
    render(<Screen />);
    const table = screen.getByRole("grid", { name: "Rows" });
    table.focus();
    fireEvent.keyDown(table, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(table, { key: "ArrowDown", shiftKey: true });
    expect(lastCall(onSelect).index).toBe(3);
  });

  it("starts again from the top when the rows mean something else", () => {
    const { table, onSelect, again } = draw();
    fireEvent.keyDown(table, { key: "End" });
    again({ resetKey: "other" });
    onSelect.mockClear();
    fireEvent.keyDown(table, { key: "ArrowDown" });
    expect(lastCall(onSelect).index).toBe(0);
  });

  it("is drawn after a key moved it, and not after a click alone", async () => {
    const { table } = draw();
    const row = (await screen.findByText("Row 3")).closest('[role="row"]')!;
    fireEvent.click(row);
    expect(document.querySelector(".track-table__row--cursor")).toBeNull();

    fireEvent.keyDown(table, { key: "ArrowDown" });
    const marked = document.querySelector(".track-table__row--cursor");
    expect(marked).not.toBeNull();
    expect(marked!.getAttribute("data-index")).toBe("3");

    fireEvent.mouseDown(row, { button: 0 });
    expect(document.querySelector(".track-table__row--cursor")).toBeNull();
  });
});

describe("a row that has not arrived", () => {
  it("is selected once it loads, exactly once", () => {
    const pending: TrackTableSource<Row> = pendingSource<Row>(40);
    const onSelect = vi.fn();
    const { table, again } = draw({ source: pending, onSelect });
    fireEvent.keyDown(table, { key: "End", shiftKey: true });
    expect(onSelect).not.toHaveBeenCalled();

    again({ source: inMemorySource(rows(40)) });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(lastCall(onSelect)).toMatchObject({ index: 39, modifiers: SHIFT });

    again({ source: inMemorySource(rows(40)) });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("is dropped when the active row goes away, as Escape clears the selection", () => {
    const onSelect = vi.fn();
    const { table, again } = draw({ source: pendingSource<Row>(40), onSelect, activeIndex: 0 });
    fireEvent.keyDown(table, { key: "End" });
    again({ activeIndex: null });
    again({ source: inMemorySource(rows(40)), activeIndex: null });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("is dropped when another key replaces it", () => {
    const onSelect = vi.fn();
    const { table, again } = draw({ source: pendingSource<Row>(40), onSelect });
    fireEvent.keyDown(table, { key: "End" });
    fireEvent.keyDown(table, { key: "Home" });
    again({ source: inMemorySource(rows(40)) });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(lastCall(onSelect).index).toBe(0);
  });
});

describe("Enter, F2 and Escape (C186, C188)", () => {
  it("Enter plays the active row and never edits it", () => {
    const onRowActivate = vi.fn();
    const onRowEdit = vi.fn();
    const { table } = draw({ activeIndex: 2, onRowActivate, onRowEdit });
    fireEvent.keyDown(table, { key: "Enter" });
    expect(onRowActivate).toHaveBeenCalledTimes(1);
    expect(onRowActivate.mock.calls[0]![1]).toBe(2);
    expect(onRowEdit).not.toHaveBeenCalled();
  });

  it("F2 edits the active row and never plays it", () => {
    const onRowActivate = vi.fn();
    const onRowEdit = vi.fn();
    const { table } = draw({ activeIndex: 3, onRowActivate, onRowEdit });
    fireEvent.keyDown(table, { key: "F2" });
    expect(onRowEdit).toHaveBeenCalledTimes(1);
    expect(onRowEdit.mock.calls[0]![0]).toMatchObject({ title: "Row 4" });
    expect(onRowEdit.mock.calls[0]![1]).toBe(3);
    expect(onRowActivate).not.toHaveBeenCalled();
  });

  it("F2 does nothing without a handler or an active row", () => {
    const onRowEdit = vi.fn();
    const first = draw({ onRowEdit });
    fireEvent.keyDown(first.table, { key: "F2" });
    expect(onRowEdit).not.toHaveBeenCalled();
  });

  it("Escape clears the selection when focus is in the table", () => {
    const onClearSelection = vi.fn();
    const { table } = draw({ onClearSelection, selectedKeys: new Set([1]) });
    fireEvent.keyDown(table, { key: "Escape" });
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it("Escape does nothing when nothing is selected", () => {
    const onClearSelection = vi.fn();
    const { table } = draw({ onClearSelection });
    fireEvent.keyDown(table, { key: "Escape" });
    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it("Escape from outside the table, such as a menu or popover, does not reach it", () => {
    const onClearSelection = vi.fn();
    draw({ onClearSelection, selectedKeys: new Set([1]) });
    const popover = document.createElement("div");
    document.body.appendChild(popover);
    fireEvent.keyDown(popover, { key: "Escape" });
    popover.remove();
    expect(onClearSelection).not.toHaveBeenCalled();
  });
});

describe("the grid and its current row (M457)", () => {
  it("is a multi-select grid of gridcells that names the cursor's row as its active descendant", () => {
    const { table } = draw({ activeIndex: 2 });
    expect(table).toHaveAttribute("role", "grid");
    expect(table).toHaveAttribute("aria-multiselectable", "true");
    expect(screen.getAllByRole("gridcell").length).toBeGreaterThan(0);
    const current = document.getElementById(table.getAttribute("aria-activedescendant")!);
    expect(current).toHaveAttribute("role", "row");
    expect(current).toHaveAttribute("data-index", "2");
    fireEvent.keyDown(table, { key: "ArrowDown" });
    const next = document.getElementById(table.getAttribute("aria-activedescendant")!);
    expect(next).toHaveAttribute("data-index", "3");
  });

  it("names no active descendant before there is a current row", () => {
    const { table } = draw();
    expect(table).not.toHaveAttribute("aria-activedescendant");
  });
});
