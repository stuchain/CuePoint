/**
 * The Universal Track Table (LIBUI-04, DEC-041).
 *
 * Four properties carry this component, and each has a test that fails if it
 * is undone:
 *
 * **A row that has not arrived is still a row.** Placeholders are exactly as
 * tall as loaded rows. If height depended on whether data had arrived, every
 * window a 50,000-row table loaded would move the ground under the pointer.
 *
 * **It holds no query.** Sorting and widths are asked for, not decided: the
 * table calls back and renders what it is given next. That is what lets one
 * component serve the library, the match results and Discover.
 *
 * **It renders a window, not a library.** Fifty thousand rows must put tens of
 * elements in the DOM, not fifty thousand.
 *
 * **A column with no sort key cannot be sorted.** It is how "playlist
 * position, outside a playlist" is expressed, so it has to be a property of
 * the column rather than a rule the table knows.
 *
 * jsdom measures nothing — every element is zero by zero and there is no
 * ResizeObserver — so the virtualizer is given a viewport below. That is a
 * fake, and it is the only one: the component under test is the real one.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { formatBpm } from "../format/bpm";
import { resetRowDensityForTests, saveRowDensity } from "../../tokens/rowDensity";
import { ScaleProvider } from "../../tokens/ScaleContext";
import { TrackTable } from "./TrackTable";
import { inMemorySource, pendingSource, type TrackTableSource } from "./trackTableSource";
import type { TrackColumnDef } from "./trackTableLayout";

const VIEWPORT_HEIGHT = 600;
const VIEWPORT_WIDTH = 1200;

beforeEach(() => {
  // Scale 1, so the widths in these assertions are the ones the columns
  // declare. The scaling itself is `trackTableLayout.test.ts`'s subject.
  localStorage.setItem("cuepoint-ui-lab-scale", "1");
});

beforeAll(() => {
  // The virtualizer measures its scroll element with offsetWidth/offsetHeight
  // and watches it with a ResizeObserver. jsdom lays nothing out — every
  // element is zero by zero — and has no ResizeObserver, so a table rendered
  // here would show no rows at all. Both are supplied, and nothing else is:
  // the component under test is the real one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => VIEWPORT_WIDTH,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => VIEWPORT_HEIGHT,
  });
});

interface Track {
  id: number;
  title: string;
  artist: string;
  bpm: number | null;
}

const COLUMNS: TrackColumnDef<Track>[] = [
  { id: "title", header: "Title", sortKey: "title", defaultWidthPx: 200, render: (t) => t.title },
  { id: "artist", header: "Artist", sortKey: "artist", render: (t) => t.artist },
  {
    id: "bpm",
    header: "BPM",
    sortKey: "bpm",
    minWidthPx: 60,
    defaultWidthPx: 80,
    align: "right",
    render: (t) => (t.bpm == null ? "" : formatBpm(t.bpm)),
  },
  // No sortKey: the column exists and cannot be ordered by.
  { id: "path", header: "File", render: () => "/music/x.mp3" },
];

function tracks(count: number): Track[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Track ${i + 1}`,
    artist: `Artist ${i + 1}`,
    bpm: i % 3 === 0 ? null : 120 + i,
  }));
}

function renderTable(props: Partial<Parameters<typeof TrackTable<Track>>[0]> = {}) {
  const source = props.source ?? inMemorySource(tracks(5));
  return render(
    <ScaleProvider>
      <TrackTable<Track>
        columns={COLUMNS}
        source={source}
        getRowKey={(row) => row.id}
        {...props}
      />
    </ScaleProvider>,
  );
}

function renderedRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((row) => row.dataset.index !== undefined);
}

describe("row height", () => {
  it("follows a change of row density", () => {
    resetRowDensityForTests();
    document.documentElement.style.setProperty("--row-height", "19px");
    try {
      renderTable();
      const heights = () => renderedRows().map((row) => row.style.height);
      expect(heights()[0]).toBe("19px");
      act(() => {
        // The stylesheet answers 26 for roomy; jsdom resolves no calc, so say it.
        document.documentElement.style.setProperty("--row-height", "26px");
        saveRowDensity("roomy");
      });
      expect(heights()[0]).toBe("26px");
      expect(renderedRows()[1]!.style.transform).toBe("translateY(26px)");
    } finally {
      document.documentElement.style.removeProperty("--row-height");
      saveRowDensity("compact");
      resetRowDensityForTests();
    }
  });
});

describe("headers", () => {
  it("renders one per column: a button where it sorts, plain text where it cannot", () => {
    renderTable();
    for (const column of COLUMNS) {
      if (column.sortKey) {
        expect(screen.getByRole("button", { name: column.header })).toBeInTheDocument();
      } else {
        expect(screen.queryByRole("button", { name: column.header })).toBeNull();
        expect(screen.getByText(column.header)).toBeInTheDocument();
      }
    }
  });

  it("follows the column's alignment: a number heading is right-aligned like its cells", () => {
    renderTable();
    expect(screen.getByRole("button", { name: "BPM" })).toHaveClass("track-table__header-cell--right");
    expect(screen.getByRole("button", { name: "Artist" })).not.toHaveClass("track-table__header-cell--right");
  });

  it("asks for an ascending sort on first click", () => {
    const onSortChange = vi.fn();
    renderTable({ onSortChange });

    fireEvent.click(screen.getByRole("button", { name: "Artist" }));

    expect(onSortChange).toHaveBeenCalledWith({ key: "artist", direction: "asc" });
  });

  it("asks for the other direction when the column is already sorted", () => {
    const onSortChange = vi.fn();
    renderTable({ onSortChange, sort: { key: "artist", direction: "asc" } });

    fireEvent.click(screen.getByRole("button", { name: "Artist" }));

    expect(onSortChange).toHaveBeenCalledWith({ key: "artist", direction: "desc" });
  });

  it("asks for ascending when switching to a different column", () => {
    const onSortChange = vi.fn();
    renderTable({ onSortChange, sort: { key: "artist", direction: "desc" } });

    fireEvent.click(screen.getByRole("button", { name: "Title" }));

    expect(onSortChange).toHaveBeenCalledWith({ key: "title", direction: "asc" });
  });

  it("does not sort itself", () => {
    // The table asks; whoever owns the query answers by passing new rows.
    const source = inMemorySource(tracks(3));
    renderTable({ source, onSortChange: vi.fn(), sort: { key: "title", direction: "desc" } });

    expect(renderedRows()[0]).toHaveTextContent("Track 1");
  });

  it("marks the sorted column for a screen reader", () => {
    renderTable({ sort: { key: "bpm", direction: "desc" }, onSortChange: vi.fn() });

    const header = screen.getAllByRole("columnheader").find((h) => h.dataset.column === "bpm");
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it("leaves the others unsorted", () => {
    renderTable({ sort: { key: "bpm", direction: "asc" }, onSortChange: vi.fn() });

    const header = screen.getAllByRole("columnheader").find((h) => h.dataset.column === "title");
    expect(header).toHaveAttribute("aria-sort", "none");
  });

  it("shows the direction it is sorted in", () => {
    renderTable({ sort: { key: "title", direction: "asc" }, onSortChange: vi.fn() });
    expect(screen.getByRole("button", { name: "Title" }).querySelector("[data-icon='arrow-up']")).not.toBeNull();
  });

  it("draws the down arrow when sorted descending", () => {
    renderTable({ sort: { key: "title", direction: "desc" }, onSortChange: vi.fn() });
    expect(screen.getByRole("button", { name: "Title" }).querySelector("[data-icon='arrow-down']")).not.toBeNull();
  });
});

describe("a column that cannot be sorted", () => {
  it("has a plain heading, not a button that does nothing", () => {
    renderTable({ onSortChange: vi.fn() });
    expect(screen.queryByRole("button", { name: "File" })).toBeNull();
    expect(screen.getByText("File").closest(".track-table__header-cell")).toHaveClass("track-table__header-cell--plain");
  });

  it("asks for nothing when clicked", () => {
    const onSortChange = vi.fn();
    renderTable({ onSortChange });

    fireEvent.click(screen.getByText("File"));

    expect(onSortChange).not.toHaveBeenCalled();
  });
});

describe("rows", () => {
  it("renders each column's value through its own renderer", () => {
    renderTable({ source: inMemorySource([{ id: 7, title: "Strobe", artist: "deadmau5", bpm: 128 }]) });

    const row = renderedRows()[0]!;
    expect(within(row).getByText("Strobe")).toBeInTheDocument();
    expect(within(row).getByText("deadmau5")).toBeInTheDocument();
    expect(within(row).getByText("128")).toBeInTheDocument();
  });

  it("keys rows by identity, not by index", () => {
    // With windowed data an index means nothing once the window moves
    // (DEC-045), so selection is by the key the caller provides.
    renderTable({
      source: inMemorySource(tracks(3)),
      selectedKeys: new Set([2]),
    });

    const selected = renderedRows().filter((row) => row.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("Track 2");
  });

  it("reports a click with the row and its index", () => {
    const onSelect = vi.fn();
    renderTable({ source: inMemorySource(tracks(3)), onSelect });

    fireEvent.click(renderedRows()[1]!);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0]).toMatchObject({ id: 2 });
    expect(onSelect.mock.calls[0]![1]).toBe(1);
  });

  it("has a double-click seam that Phase 5 fills (DEC-046)", () => {
    const onRowActivate = vi.fn();
    renderTable({ source: inMemorySource(tracks(2)), onRowActivate });

    fireEvent.doubleClick(renderedRows()[0]!);

    expect(onRowActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 0);
  });

  it("does nothing on double-click when nobody is listening", () => {
    // Which is Phase 4's actual behaviour: the gesture belongs to playback.
    const onSelect = vi.fn();
    renderTable({ source: inMemorySource(tracks(2)), onSelect });

    expect(() => fireEvent.doubleClick(renderedRows()[0]!)).not.toThrow();
  });
});

describe("a cell at the row's end (rowEnd, C15d)", () => {
  it("is drawn on the rows the caller asks for, after the columns, with the row and its index", () => {
    const rowEnd = vi.fn((row: Track) => (row.id === 2 ? <button type="button">Act on {row.title}</button> : null));
    renderTable({ source: inMemorySource(tracks(3)), rowEnd });

    const rowsNow = renderedRows();
    expect(within(rowsNow[0]!).queryByRole("button")).toBeNull();
    expect(within(rowsNow[2]!).queryByRole("button")).toBeNull();
    const cell = within(rowsNow[1]!).getByRole("button", { name: "Act on Track 2" }).closest(".track-table__end");
    expect(cell).not.toBeNull();
    // The last child of the row, a sticky cell of its own: no column, so the grid and the picker are as they were.
    expect(rowsNow[1]!.lastElementChild).toBe(cell);
    expect(rowEnd).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), 1);
    expect(rowsNow[1]!.querySelectorAll(":scope > .track-table__cell")).toHaveLength(COLUMNS.length);
    // Only a row with one is clipped for it (a sticky cell sticks to the table, not to the row).
    expect(rowsNow[1]!).toHaveClass("track-table__row--end");
    expect(rowsNow[0]!).not.toHaveClass("track-table__row--end");
    // The end cell spans the row's one grid row, so its cells are placed by hand, in order.
    const placed = [...rowsNow[1]!.querySelectorAll<HTMLElement>(":scope > .track-table__cell")].map((c) => c.getAttribute("style") ?? "");
    expect(placed.map((style) => /grid-column:\s*(\d+)/.exec(style)?.[1])).toEqual(COLUMNS.map((_, index) => String(index + 1)));
  });

  it("draws no cell at all when the caller has nothing for the row", () => {
    renderTable({ source: inMemorySource(tracks(2)), rowEnd: () => null });
    expect(document.querySelector(".track-table__end")).toBeNull();
  });

  it("is not drawn for a row that has not arrived", () => {
    const rowEnd = vi.fn(() => <span>end</span>);
    renderTable({ source: pendingSource(3), rowEnd });
    expect(rowEnd).not.toHaveBeenCalled();
  });
});

describe("moving the active row with Alt+↑ and Alt+↓ (FLW-10)", () => {
  const table = () => screen.getByRole("table");

  it("reports the active row and the direction", () => {
    const onRowMove = vi.fn();
    renderTable({ source: inMemorySource(tracks(3)), activeIndex: 1, onRowMove });

    fireEvent.keyDown(table(), { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(table(), { key: "ArrowUp", altKey: true });

    expect(onRowMove.mock.calls).toEqual([
      [1, 1],
      [1, -1],
    ]);
  });

  it("leaves the plain arrows alone", () => {
    const onRowMove = vi.fn();
    renderTable({ source: inMemorySource(tracks(3)), activeIndex: 1, onRowMove });
    fireEvent.keyDown(table(), { key: "ArrowDown" });
    expect(onRowMove).not.toHaveBeenCalled();
  });

  it("does nothing without an active row or a listener", () => {
    const onRowMove = vi.fn();
    renderTable({ source: inMemorySource(tracks(3)), activeIndex: null, onRowMove });
    fireEvent.keyDown(table(), { key: "ArrowDown", altKey: true });
    expect(onRowMove).not.toHaveBeenCalled();
    expect(() => {
      renderTable({ source: inMemorySource(tracks(3)), activeIndex: 0 });
      fireEvent.keyDown(screen.getAllByRole("table")[1]!, { key: "ArrowDown", altKey: true });
    }).not.toThrow();
  });
});

describe("the context menu gesture (PLAYER-09)", () => {
  it("reports the row and where the pointer was", () => {
    const onRowContextMenu = vi.fn();
    renderTable({ source: inMemorySource(tracks(3)), onRowContextMenu });

    fireEvent.contextMenu(renderedRows()[1]!, { clientX: 320, clientY: 180 });

    expect(onRowContextMenu).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), 1, {
      x: 320,
      y: 180,
    });
  });

  it("keeps the browser's own menu out of the way", () => {
    renderTable({ source: inMemorySource(tracks(2)), onRowContextMenu: vi.fn() });

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(renderedRows()[0]!, event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves the browser's menu alone when nobody is listening", () => {
    // A table with no menu of its own must not swallow the platform's.
    renderTable({ source: inMemorySource(tracks(2)) });

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(renderedRows()[0]!, event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("says nothing for a row that has not arrived", () => {
    const onRowContextMenu = vi.fn();
    renderTable({ source: pendingSource(50), onRowContextMenu });

    fireEvent.contextMenu(renderedRows()[0]!, { clientX: 10, clientY: 10 });

    expect(onRowContextMenu).not.toHaveBeenCalled();
  });

  it("opens on the active row from the keyboard, hung off that row", () => {
    // Shift+F10 and the menu key are the keyboard's context menu. Chromium
    // sends them to the focused element — the scroller — so the table has to
    // find the row itself.
    const onRowContextMenu = vi.fn();
    renderTable({ source: inMemorySource(tracks(5)), onRowContextMenu, activeIndex: 2 });

    const table = screen.getByRole("table");
    fireEvent.keyDown(table, { key: "F10", shiftKey: true });
    expect(onRowContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3 }),
      2,
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );

    onRowContextMenu.mockClear();
    fireEvent.keyDown(table, { key: "ContextMenu" });
    expect(onRowContextMenu).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), 2, expect.anything());
  });

  it("ignores the menu key with no active row", () => {
    const onRowContextMenu = vi.fn();
    renderTable({ source: inMemorySource(tracks(5)), onRowContextMenu, activeIndex: null });

    fireEvent.keyDown(screen.getByRole("table"), { key: "ContextMenu" });

    expect(onRowContextMenu).not.toHaveBeenCalled();
  });

  it("ignores F10 without shift, which is the browser's own", () => {
    const onRowContextMenu = vi.fn();
    renderTable({ source: inMemorySource(tracks(5)), onRowContextMenu, activeIndex: 0 });

    fireEvent.keyDown(screen.getByRole("table"), { key: "F10" });

    expect(onRowContextMenu).not.toHaveBeenCalled();
  });

  it("activates the active row on Enter", () => {
    // The keyboard's double-click. Without it playing a track is mouse-only.
    const onRowActivate = vi.fn();
    renderTable({ source: inMemorySource(tracks(5)), onRowActivate, activeIndex: 3 });

    fireEvent.keyDown(screen.getByRole("table"), { key: "Enter" });

    expect(onRowActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }), 3);
  });

  it("ignores Enter with no active row", () => {
    const onRowActivate = vi.fn();
    renderTable({ source: inMemorySource(tracks(5)), onRowActivate });

    fireEvent.keyDown(screen.getByRole("table"), { key: "Enter" });

    expect(onRowActivate).not.toHaveBeenCalled();
  });

  it("can be reached and held by the keyboard", () => {
    // The menu gives focus back here when it closes; a table that cannot take
    // focus would drop the user at the top of the page instead.
    renderTable();

    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("tabindex", "0");
    table.focus();
    expect(table).toHaveFocus();
  });
});

describe("rows that have not arrived", () => {
  it("renders a placeholder for every unloaded row", () => {
    renderTable({ source: pendingSource<Track>(20) });

    const rows = renderedRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.dataset.placeholder === "true")).toBe(true);
  });

  it("gives a placeholder exactly the height of a loaded row", () => {
    // The property that keeps scrolling from jumping.
    const { unmount } = renderTable({ source: inMemorySource(tracks(20)) });
    const loadedHeight = renderedRows()[0]!.style.height;
    unmount();

    renderTable({ source: pendingSource<Track>(20) });
    expect(renderedRows()[0]!.style.height).toBe(loadedHeight);
  });

  it("positions later placeholders as if the rows were there", () => {
    renderTable({ source: pendingSource<Track>(20) });

    const rows = renderedRows();
    expect(rows[0]!.style.transform).toBe("translateY(0px)");
    expect(rows[1]!.style.transform).not.toBe("translateY(0px)");
  });

  it("does not report a click on a row that is not there", () => {
    const onSelect = vi.fn();
    renderTable({ source: pendingSource<Track>(20), onSelect });

    fireEvent.click(renderedRows()[0]!);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("mixes loaded and unloaded rows", () => {
    const loaded = tracks(3);
    const source: TrackTableSource<Track> = {
      total: 10,
      getRow: (index) => (index < 3 ? loaded[index] : undefined),
    };
    renderTable({ source });

    const rows = renderedRows();
    expect(rows[0]!.dataset.placeholder).toBeUndefined();
    expect(rows[5]!.dataset.placeholder).toBe("true");
  });
});

describe("the window", () => {
  it("renders a window rather than a library", () => {
    renderTable({ source: pendingSource<Track>(50_000) });

    // 600px of viewport at ~33px a row, plus overscan — tens, not thousands.
    expect(renderedRows().length).toBeLessThan(100);
  });

  it("sizes the scroll range for every row", () => {
    renderTable({ source: pendingSource<Track>(50_000) });

    const body = screen.getByRole("rowgroup");
    const height = Number.parseFloat(body.style.height);
    expect(height).toBeGreaterThan(50_000 * 20);
  });

  it("tells the source which rows are on screen", () => {
    const requestWindow = vi.fn();
    renderTable({
      source: { total: 5_000, getRow: () => undefined, requestWindow },
    });

    expect(requestWindow).toHaveBeenCalled();
    const [start, end] = requestWindow.mock.calls.at(-1)!;
    expect(start).toBe(0);
    expect(end).toBeGreaterThan(0);
    expect(end).toBeLessThan(5_000);
  });

  it("asks once for a range, not once per row", () => {
    const requestWindow = vi.fn();
    renderTable({
      source: { total: 5_000, getRow: () => undefined, requestWindow },
    });

    expect(requestWindow.mock.calls.length).toBeLessThan(5);
  });

  it("asks for nothing when there is nothing to ask about", () => {
    const requestWindow = vi.fn();
    renderTable({ source: { total: 0, getRow: () => undefined, requestWindow } });

    expect(requestWindow).not.toHaveBeenCalled();
  });
});

describe("at fifty thousand rows", () => {
  it("renders in well under a second", () => {
    // Not a benchmark — a catastrophe detector. A table that rendered every
    // row rather than a window would take minutes here, and the number that
    // matters is the one measured in the real app.
    const started = performance.now();
    renderTable({ source: pendingSource<Track>(50_000) });
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("puts a bounded number of elements in the document", () => {
    renderTable({ source: pendingSource<Track>(50_000) });
    expect(document.querySelectorAll(".track-table__cell").length).toBeLessThan(
      100 * COLUMNS.length,
    );
  });
});

describe("scale", () => {
  it("multiplies every declared width", () => {
    localStorage.setItem("cuepoint-ui-lab-scale", "3");
    renderTable();

    const table = screen.getByTestId("track-table");
    expect(table.style.getPropertyValue("--track-table-columns")).toBe(
      "600px 510px 240px minmax(360px, 1fr)",
    );
  });

  it("raises a stored width that is below the scaled minimum", () => {
    // A column dragged narrow at 1× must not be narrower than its own resize
    // handle at 3×.
    localStorage.setItem("cuepoint-ui-lab-scale", "3");
    renderTable({ widths: { title: 200, artist: 120, bpm: 60, path: 120 } });

    const table = screen.getByTestId("track-table");
    expect(table.style.getPropertyValue("--track-table-columns")).toBe(
      "240px 240px 180px minmax(240px, 1fr)",
    );
  });
});

describe("empty", () => {
  it("says so when the query matched nothing", () => {
    renderTable({ source: inMemorySource<Track>([]) });
    expect(screen.getByText("No tracks")).toBeInTheDocument();
  });

  it("says what the caller wants said", () => {
    renderTable({
      source: inMemorySource<Track>([]),
      emptyState: "No tracks match this filter",
    });
    expect(screen.getByText("No tracks match this filter")).toBeInTheDocument();
  });

  it("still renders its headers", () => {
    // The columns are still what the table is; an empty result is not a
    // reason to hide what could be sorted.
    renderTable({ source: inMemorySource<Track>([]) });
    expect(screen.getByRole("button", { name: "Title" })).toBeInTheDocument();
  });
});

describe("dragging a column header", () => {
  function headerFor(name: string): HTMLElement {
    return screen.getAllByRole("columnheader").find((h) => h.dataset.column === name)!;
  }

  function dataTransfer() {
    const store: Record<string, string> = {};
    return {
      setData: (type: string, value: string) => {
        store[type] = value;
      },
      getData: (type: string) => store[type] ?? "",
    };
  }

  it("reports where a column was dropped", () => {
    const onColumnMove = vi.fn();
    renderTable({ onColumnMove });
    const transfer = dataTransfer();

    fireEvent.dragStart(headerFor("bpm"), { dataTransfer: transfer });
    fireEvent.dragOver(headerFor("title"), { dataTransfer: transfer });
    fireEvent.drop(headerFor("title"), { dataTransfer: transfer });

    expect(onColumnMove).toHaveBeenCalledWith("bpm", 0);
  });

  it("does not decide whether the move is allowed", () => {
    // A pinned column staying pinned is the layout owner's rule (LIBUI-06);
    // the table reports the gesture and renders whatever comes back.
    const onColumnMove = vi.fn();
    renderTable({ onColumnMove });
    const transfer = dataTransfer();

    fireEvent.dragStart(headerFor("artist"), { dataTransfer: transfer });
    fireEvent.drop(headerFor("title"), { dataTransfer: transfer });

    expect(onColumnMove).toHaveBeenCalledWith("artist", 0);
  });

  it("reports nothing when a column is dropped on itself", () => {
    const onColumnMove = vi.fn();
    renderTable({ onColumnMove });
    const transfer = dataTransfer();

    fireEvent.dragStart(headerFor("bpm"), { dataTransfer: transfer });
    fireEvent.drop(headerFor("bpm"), { dataTransfer: transfer });

    expect(onColumnMove).not.toHaveBeenCalled();
  });

  it("is not draggable when nobody is listening", () => {
    // A table with a fixed column set should not look rearrangeable.
    renderTable();
    expect(headerFor("bpm")).not.toHaveAttribute("draggable", "true");
  });

  it("is draggable when somebody is", () => {
    renderTable({ onColumnMove: vi.fn() });
    expect(headerFor("bpm")).toHaveAttribute("draggable", "true");
  });

  it("marks the header being dragged", () => {
    renderTable({ onColumnMove: vi.fn() });
    const transfer = dataTransfer();

    fireEvent.dragStart(headerFor("bpm"), { dataTransfer: transfer });
    expect(headerFor("bpm").className).toContain("dragging");

    fireEvent.dragEnd(headerFor("bpm"), { dataTransfer: transfer });
    expect(headerFor("bpm").className).not.toContain("dragging");
  });
});

describe("when the rows start answering a different question", () => {
  it("scrolls back to the top", () => {
    // Position in a list means something only relative to the question that
    // produced it: keeping the offset through a sort change shows a user a
    // different place in a different order (LIBUI-05).
    const { rerender } = render(
      <ScaleProvider>
        <TrackTable<Track>
          columns={COLUMNS}
          source={pendingSource<Track>(50_000)}
          resetKey="artist-asc"
        />
      </ScaleProvider>,
    );

    const scroll = document.querySelector(".track-table__scroll") as HTMLElement;
    scroll.scrollTop = 4_000;

    rerender(
      <ScaleProvider>
        <TrackTable<Track>
          columns={COLUMNS}
          source={pendingSource<Track>(50_000)}
          resetKey="bpm-desc"
        />
      </ScaleProvider>,
    );

    expect(scroll.scrollTop).toBe(0);
  });

  it("stays where it is when the question has not changed", () => {
    const { rerender } = render(
      <ScaleProvider>
        <TrackTable<Track>
          columns={COLUMNS}
          source={pendingSource<Track>(50_000)}
          resetKey="artist-asc"
        />
      </ScaleProvider>,
    );

    const scroll = document.querySelector(".track-table__scroll") as HTMLElement;
    scroll.scrollTop = 4_000;

    rerender(
      <ScaleProvider>
        <TrackTable<Track>
          columns={COLUMNS}
          source={pendingSource<Track>(50_000)}
          resetKey="artist-asc"
        />
      </ScaleProvider>,
    );

    expect(scroll.scrollTop).toBe(4_000);
  });
});

describe("column widths", () => {
  it("uses each column's default", () => {
    renderTable();
    const table = screen.getByTestId("track-table");
    expect(table.style.getPropertyValue("--track-table-columns")).toBe(
      "200px 170px 80px minmax(120px, 1fr)",
    );
  });

  it("uses the widths it is given", () => {
    renderTable({ widths: { title: 300, artist: 100, bpm: 60, path: 90 } });
    const table = screen.getByTestId("track-table");
    expect(table.style.getPropertyValue("--track-table-columns")).toBe(
      "300px 100px 60px minmax(90px, 1fr)",
    );
  });

  it("reports a drag rather than deciding it", () => {
    const onWidthsChange = vi.fn();
    renderTable({ widths: { title: 200, artist: 120, bpm: 80, path: 120 }, onWidthsChange });

    const handle = screen.getByRole("separator", { name: "Resize Title column" });
    fireEvent.mouseDown(handle, { clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 50 });
    fireEvent.mouseUp(window);

    expect(onWidthsChange).toHaveBeenCalledWith(
      expect.objectContaining({ title: 250, artist: 120 }),
    );
  });

  it("stops a drag at the column's minimum", () => {
    const onWidthsChange = vi.fn();
    renderTable({ widths: { title: 200, artist: 120, bpm: 80, path: 120 }, onWidthsChange });

    const handle = screen.getByRole("separator", { name: "Resize BPM column" });
    fireEvent.mouseDown(handle, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 0 });
    fireEvent.mouseUp(window);

    expect(onWidthsChange).toHaveBeenLastCalledWith(expect.objectContaining({ bpm: 60 }));
  });

  it("resizes without a controlled width, for a caller that does not persist", () => {
    renderTable();

    const handle = screen.getByRole("separator", { name: "Resize Title column" });
    fireEvent.mouseDown(handle, { clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 40 });
    fireEvent.mouseUp(window);

    const table = screen.getByTestId("track-table");
    expect(table.style.getPropertyValue("--track-table-columns")).toBe(
      "240px 170px 80px minmax(120px, 1fr)",
    );
  });

  it("marks the body while a column is being dragged", () => {
    renderTable();

    const handle = screen.getByRole("separator", { name: "Resize Title column" });
    fireEvent.mouseDown(handle, { clientX: 0 });
    expect(document.body).toHaveClass("track-table--resizing");

    fireEvent.mouseUp(window);
    expect(document.body).not.toHaveClass("track-table--resizing");
  });
});

describe("dragging rows (ORG-11)", () => {
  /**
   * A DataTransfer good enough for a drag between two of our own components.
   *
   * jsdom has none, and the real one is the thing under test either side of
   * this boundary — so it remembers what was put on it and answers the types
   * it was given, which is exactly what the readers depend on.
   */
  function transfer(initial: Record<string, string> = {}) {
    const data: Record<string, string> = { ...initial };
    return {
      dropEffect: "none",
      effectAllowed: "none",
      get types() {
        return Object.keys(data);
      },
      getData: (format: string) => data[format] ?? "",
      setData: (format: string, value: string) => {
        data[format] = value;
      },
    } as unknown as DataTransfer;
  }

  it("does not make rows draggable unless someone wants them to be", () => {
    // Every other table in the app: a row that can be picked up and dropped
    // nowhere is an affordance that teaches the wrong thing.
    renderTable();
    expect(renderedRows()[0]).not.toHaveAttribute("draggable", "true");
  });

  it("makes them draggable when a handler is given", () => {
    renderTable({ onRowDragStart: vi.fn() });
    expect(renderedRows()[0]).toHaveAttribute("draggable", "true");
  });

  it("hands over the row, its index and the transfer", () => {
    const onRowDragStart = vi.fn();
    renderTable({ onRowDragStart });

    const dataTransfer = transfer();
    fireEvent.dragStart(renderedRows()[2]!, { dataTransfer });

    expect(onRowDragStart).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3 }),
      2,
      dataTransfer,
    );
  });

  /**
   * A drag event carrying both a transfer and a pointer position.
   *
   * `fireEvent.dragOver` builds a plain `Event` — jsdom has no `DragEvent` —
   * and a plain Event has no `clientY`, so the half of the row the pointer is
   * over would always read as the top one. A `MouseEvent` carries the
   * position, and the transfer is attached the way the browser attaches it.
   */
  function drag(
    type: "dragover" | "drop",
    row: HTMLElement,
    dataTransfer: DataTransfer,
    clientY = 0,
  ) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    fireEvent(row, event);
  }

  it("marks the gap above a row when a drop would land there", () => {
    renderTable({ onRowDrop: vi.fn() });

    // jsdom lays nothing out, so every rect is zero by zero: a clientY of 0 is
    // the top half of the row and anything past it is the bottom half.
    drag("dragover", renderedRows()[2]!, transfer(), 0);

    expect(renderedRows()[2]).toHaveAttribute("data-drop", "before");
  });

  it("answers a drag that only copies with a copy, and any other with a move (PREP-11)", () => {
    renderTable({ onRowDrop: vi.fn() });

    // Chromium drops nothing whose drop effect its drag does not allow, and
    // says nothing about it: a track dragged into a Set is a copy.
    const copy = transfer();
    copy.effectAllowed = "copy";
    drag("dragover", renderedRows()[2]!, copy, 0);
    expect(copy.dropEffect).toBe("copy");

    const move = transfer();
    move.effectAllowed = "move";
    drag("dragover", renderedRows()[2]!, move, 0);
    expect(move.dropEffect).toBe("move");
  });

  it("marks the gap below a row when the pointer is past its middle", () => {
    renderTable({ onRowDrop: vi.fn() });

    drag("dragover", renderedRows()[2]!, transfer(), 5);

    expect(renderedRows()[2]).toHaveAttribute("data-drop", "after");
  });

  it("reports the gap the drop landed in, not the row it was over", () => {
    // An insertion point, so the last row can be dropped past: a reorder puts
    // a track *between* two, and "onto row 4" cannot say "at the end".
    const onRowDrop = vi.fn();
    renderTable({ onRowDrop });

    const dataTransfer = transfer();
    drag("dragover", renderedRows()[2]!, dataTransfer, 5);
    drag("drop", renderedRows()[2]!, dataTransfer, 5);

    // The row it landed on, too: row 2, whose lower half is the gap before 3.
    expect(onRowDrop).toHaveBeenCalledWith(3, dataTransfer, 2);
  });

  it("marks nothing and accepts nothing when the drag is refused", () => {
    const onRowDrop = vi.fn();
    renderTable({ onRowDrop, acceptsRowDrop: () => false });

    const dataTransfer = transfer();
    drag("dragover", renderedRows()[2]!, dataTransfer, 0);
    expect(renderedRows()[2]).not.toHaveAttribute("data-drop");

    drag("drop", renderedRows()[2]!, dataTransfer, 0);
    expect(onRowDrop).not.toHaveBeenCalled();
  });

  it("asks about the drag itself, not just about the table", () => {
    const acceptsRowDrop = vi.fn(() => true);
    renderTable({ onRowDrop: vi.fn(), acceptsRowDrop });

    const dataTransfer = transfer({ "application/x-cuepoint-track-ids": "[1]" });
    drag("dragover", renderedRows()[0]!, dataTransfer, 0);

    expect(acceptsRowDrop).toHaveBeenCalledWith(dataTransfer);
  });

  it("takes the mark away when the drag leaves", () => {
    renderTable({ onRowDrop: vi.fn() });
    const row = renderedRows()[1]!;

    drag("dragover", row, transfer(), 0);
    fireEvent.dragLeave(row);

    expect(row).not.toHaveAttribute("data-drop");
  });

  it("lands a drop that comes right after a dragleave", () => {
    // Moving from one cell to the next fires dragleave on the way, and a drop that beats the
    // next dragover must not find the place already forgotten.
    const onRowDrop = vi.fn();
    renderTable({ onRowDrop });
    const row = renderedRows()[2]!;
    const dataTransfer = transfer();

    drag("dragover", row, dataTransfer, 5);
    fireEvent.dragLeave(row);
    drag("drop", row, dataTransfer, 5);

    expect(onRowDrop).toHaveBeenCalledWith(3, dataTransfer, 2);
  });

  it("takes a drop below the last row as the end", () => {
    const onRowDrop = vi.fn();
    renderTable({ onRowDrop });
    const table = screen.getByRole("table");
    const body = table.querySelector(".track-table__body") as HTMLElement;
    body.getBoundingClientRect = () => ({ top: 0, bottom: 180, left: 0, right: 0, width: 0, height: 180, x: 0, y: 0, toJSON: () => ({}) });
    const dataTransfer = transfer();

    drag("dragover", table, dataTransfer, 4000);
    drag("drop", table, dataTransfer, 4000);

    expect(onRowDrop).toHaveBeenCalledWith(5, dataTransfer, 4);
  });

  it("takes a drop over the header as the very start", () => {
    const onRowDrop = vi.fn();
    renderTable({ onRowDrop });
    const header = screen.getAllByRole("row").find((row) => row.dataset.index === undefined)!;
    const dataTransfer = transfer();

    drag("dragover", header, dataTransfer, 900);
    drag("drop", header, dataTransfer, 900);

    expect(onRowDrop).toHaveBeenCalledWith(0, dataTransfer, 0);
  });

  it("tags the line above a row that dropTag names", () => {
    renderTable({ onRowDrop: vi.fn(), dropTag: (row) => (row.id === 2 ? "Peak" : undefined) });
    drag("dragover", renderedRows()[1]!, transfer(), 0);
    expect(renderedRows()[1]).toHaveAttribute("data-drop-chapter", "Peak");
    drag("dragover", renderedRows()[2]!, transfer(), 0);
    expect(renderedRows()[1]).not.toHaveAttribute("data-drop-chapter");
    expect(renderedRows()[2]).not.toHaveAttribute("data-drop-chapter");
  });

  it("hands an empty table's drop to onEmptyDrop, wherever in it", () => {
    const onEmptyDrop = vi.fn();
    renderTable({ source: inMemorySource([]), onEmptyDrop });
    const table = screen.getByRole("table");
    const dataTransfer = transfer();

    const over = new MouseEvent("dragover", { bubbles: true, cancelable: true });
    Object.defineProperty(over, "dataTransfer", { value: dataTransfer });
    fireEvent(table, over);
    expect(over.defaultPrevented).toBe(true);
    drag("drop", table, dataTransfer, 300);

    expect(onEmptyDrop).toHaveBeenCalledWith(dataTransfer);
  });

  it("says a drop is welcome while an accepted drag is over, and stops when it is gone", () => {
    renderTable({ onRowDrop: vi.fn(), dropLabel: "Drop here to add to “Friday”" });
    const root = screen.getByTestId("track-table");
    expect(root).not.toHaveAttribute("data-drop-ready");

    const dataTransfer = transfer();
    drag("dragover", renderedRows()[1]!, dataTransfer, 0);
    expect(root).toHaveAttribute("data-drop-ready");
    expect(screen.getByText("Drop here to add to “Friday”")).toBeInTheDocument();

    fireEvent.dragLeave(screen.getByRole("table"));
    expect(root).not.toHaveAttribute("data-drop-ready");

    drag("dragover", renderedRows()[1]!, dataTransfer, 0);
    drag("drop", renderedRows()[1]!, dataTransfer, 0);
    expect(root).not.toHaveAttribute("data-drop-ready");
    expect(screen.queryByText("Drop here to add to “Friday”")).not.toBeInTheDocument();
  });

  it("keeps the mark while the pointer moves between its own cells", () => {
    renderTable({ onRowDrop: vi.fn(), dropLabel: "Drop here" });
    const row = renderedRows()[1]!;
    drag("dragover", row, transfer(), 0);

    // A MouseEvent, because jsdom's plain Event has no relatedTarget to carry.
    fireEvent(row, new MouseEvent("dragleave", { bubbles: true, relatedTarget: renderedRows()[2] }));

    expect(screen.getByTestId("track-table")).toHaveAttribute("data-drop-ready");
  });

  it("shows the label and the outline for a drag the owner says is in progress", () => {
    renderTable({ onRowDrop: vi.fn(), dropLabel: "Drop here", dragActive: true });
    expect(screen.getByTestId("track-table")).toHaveAttribute("data-drag-active");
    expect(screen.getByText("Drop here")).toBeInTheDocument();
  });

  it("gives a draggable row its grip class, and a plain row none", () => {
    renderTable({ onRowDragStart: vi.fn(), canDragRow: (row) => row.id !== 2 });
    expect(renderedRows()[0]).toHaveClass("track-table__row--draggable");
    expect(renderedRows()[1]).not.toHaveClass("track-table__row--draggable");
  });

  it("draws the grip on draggable rows by default, and not when showGrip is off", () => {
    const { unmount } = renderTable({ onRowDragStart: vi.fn() });
    expect(renderedRows()[0]).toHaveClass("track-table__row--grip");
    unmount();
    renderTable({ onRowDragStart: vi.fn(), showGrip: false });
    expect(renderedRows()[0]).toHaveClass("track-table__row--draggable");
    expect(renderedRows()[0]).not.toHaveClass("track-table__row--grip");
    expect(renderedRows()[0]).toHaveAttribute("draggable", "true");
  });

  it("accepts no drop at all when nobody is listening for one", () => {
    renderTable();
    drag("dragover", renderedRows()[0]!, transfer(), 0);
    expect(renderedRows()[0]).not.toHaveAttribute("data-drop");
  });
});

describe("a column's hint (DEC-201)", () => {
  const WITH_HINT: TrackColumnDef<Track>[] = [
    ...COLUMNS.slice(0, 2),
    {
      id: "key",
      header: "Key",
      sortKey: "key",
      hint: "Keys come from Beatport matches",
      render: () => "—",
    },
  ];

  it("shows the hint on hover and keeps the header as the button's name (the app hint, not a native title)", () => {
    renderTable({ columns: WITH_HINT });

    const key = screen.getByRole("button", { name: "Key" });
    expect(key).toHaveAttribute("title", "Keys come from Beatport matches");
    // A column without a hint still names itself.
    expect(screen.getByRole("button", { name: "Title" })).toBeInTheDocument();
  });

  it("shows it on keyboard focus too", async () => {
    const user = userEvent.setup();
    renderTable({ columns: WITH_HINT });

    const key = screen.getByRole("button", { name: "Key" });
    for (let step = 0; step < 10 && document.activeElement !== key; step += 1) await user.tab();

    expect(key).toHaveFocus();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Keys come from Beatport matches");
  });

  it("still sorts", () => {
    const onSortChange = vi.fn();
    renderTable({ columns: WITH_HINT, onSortChange });

    fireEvent.click(screen.getByRole("button", { name: "Key" }));

    expect(onSortChange).toHaveBeenCalledWith({ key: "key", direction: "asc" });
  });
});

describe("the playing and played rows (R4-6)", () => {
  it("marks the playing row, and only that one", () => {
    renderTable({ isPlayingRow: (row) => row.id === 2 });

    const rows = screen.getAllByRole("row").filter((row) => row.hasAttribute("data-index"));
    const playing = rows.filter((row) => row.classList.contains("track-table__row--playing"));
    expect(playing).toHaveLength(1);
    expect(playing[0]).toHaveAttribute("data-playing", "true");
    expect(within(playing[0]).getByText("Now playing:")).toBeInTheDocument();
    expect(screen.getAllByText("Now playing:")).toHaveLength(1);
  });

  it("puts the speaker in the title cell", () => {
    renderTable({ isPlayingRow: (row) => row.id === 2 });

    const cell = document.querySelector<HTMLElement>(
      '.track-table__row--playing [data-column="title"]',
    );
    expect(cell?.querySelector('svg[data-icon="volume"]')).not.toBeNull();
    expect(cell?.textContent).toContain("Now playing: ");
  });

  it("puts the mark in the title cell even when another column comes first", () => {
    renderTable({
      columns: [COLUMNS[2]!, COLUMNS[1]!, COLUMNS[0]!],
      isPlayingRow: (row) => row.id === 2,
    });

    const row = document.querySelector<HTMLElement>(".track-table__row--playing")!;
    expect(row.querySelector('[data-column="title"] svg[data-icon="volume"]')).not.toBeNull();
    expect(row.querySelectorAll('svg[data-icon="volume"]')).toHaveLength(1);
  });

  it("falls back to the first cell when there is no title column", () => {
    renderTable({ columns: [COLUMNS[1]!, COLUMNS[2]!], isPlayingRow: (row) => row.id === 2 });

    const first = document.querySelector<HTMLElement>(".track-table__row--playing .track-table__cell");
    expect(first?.querySelector('svg[data-icon="volume"]')).not.toBeNull();
  });

  it("marks a played row, unless it is the playing one", () => {
    renderTable({ isPlayingRow: (row) => row.id === 2, wasPlayedRow: (row) => row.id <= 2 });

    expect(document.querySelectorAll(".track-table__row--played")).toHaveLength(1);
    expect(document.querySelector(".track-table__row--played")).toHaveAttribute("data-index", "0");
    expect(document.querySelector(".track-table__row--playing")).not.toHaveClass(
      "track-table__row--played",
    );
  });

  it("marks nothing when the props are absent", () => {
    renderTable();

    expect(document.querySelector(".track-table__row--playing")).toBeNull();
    expect(document.querySelector(".track-table__row--played")).toBeNull();
    expect(document.querySelector("[data-playing]")).toBeNull();
    expect(screen.queryByText("Now playing:")).toBeNull();
  });
});

describe("the columns button in the header's corner (K21)", () => {
  it("is drawn only when the caller gives a way to open the columns", () => {
    const { unmount } = renderTable();
    expect(screen.queryByRole("button", { name: "Columns…" })).toBeNull();
    unmount();

    renderTable({ onColumns: vi.fn() });
    expect(screen.getByRole("button", { name: "Columns…" })).toBeInTheDocument();
  });

  it("calls onColumns when pressed", async () => {
    const onColumns = vi.fn();
    renderTable({ onColumns });
    await userEvent.click(screen.getByRole("button", { name: "Columns…" }));
    expect(onColumns).toHaveBeenCalledTimes(1);
  });

  it("has a track of its own after the last column, and widens the table by it", () => {
    renderTable({ onColumns: vi.fn() });
    const table = screen.getByTestId("track-table");
    expect(table.style.getPropertyValue("--track-table-columns")).toBe(
      "200px 170px 80px minmax(120px, 1fr) var(--track-table-corner)",
    );
    expect(table.style.getPropertyValue("--track-table-min-width")).toContain("var(--track-table-corner)");
  });

  it("leaves the tracks alone when there is no Columns… button", () => {
    renderTable();
    expect(screen.getByTestId("track-table").style.getPropertyValue("--track-table-columns")).toBe(
      "200px 170px 80px minmax(120px, 1fr)",
    );
  });

  it("keeps every heading's words clear of the button when the table scrolls sideways (C69)", async () => {
    renderTable({ onColumns: vi.fn() });
    const table = screen.getByTestId("track-table");
    expect(table.style.getPropertyValue("--track-table-cover")).toBe("var(--track-table-corner)");
    // The words and the sort arrow are one label, which slides left of the button.
    const label = screen.getByText("BPM").closest(".track-table__header-label");
    expect(label).not.toBeNull();
    const css = (await import("./TrackTable.css?raw")).default;
    const rule = /\.track-table__header-label\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/position:\s*sticky/);
    expect(rule).toMatch(/right:\s*var\(--track-table-cover/);
    // "hidden" would make each heading a scroll container, and the label would stick to it.
    const cell = /\.track-table__header-cell\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(cell).toMatch(/overflow:\s*clip/);
  });

  it("covers the rows under the button too, so a column cut at the edge is cut at one place (C69)", async () => {
    renderTable({ onColumns: vi.fn() });
    for (const row of renderedRows()) expect(row.querySelector(".track-table__row-corner")).not.toBeNull();
    const css = (await import("./TrackTable.css?raw")).default;
    const rule = /\.track-table__row-corner\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(rule).toMatch(/position:\s*sticky/);
    expect(rule).toMatch(/grid-column:\s*-2 \/ -1/);
    // A selected row's cover is its flat fill: the accent bar at the row's left is not drawn again.
    expect(css).toMatch(/\.track-table__row--selected \.track-table__row-corner\s*\{\s*background:\s*var\(--bg-selected\)/);
  });

  it("leaves nothing to cover without the button", () => {
    renderTable();
    expect(screen.getByTestId("track-table").style.getPropertyValue("--track-table-cover")).toBe("0px");
  });

  it("is no column header, and the table's columns are still the caller's", () => {
    renderTable({ onColumns: vi.fn() });
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(COLUMNS.length);
    const button = screen.getByRole("button", { name: "Columns…" });
    expect(headers.some((header) => header.contains(button))).toBe(false);
    // It sits in the header row, outside any cell of the ARIA table.
    expect(button.closest(".track-table__header")).not.toBeNull();
    expect(button.closest("[role='presentation']")).not.toBeNull();
  });
});

describe("cut-off text ends in an ellipsis and shows in full in the app hint (area 13)", () => {
  it("draws a text value in its own box that the hint host reads, not as a bare flex child", () => {
    renderTable({ source: inMemorySource([{ id: 7, title: "A very long title", artist: "deadmau5", bpm: 128 }]) });
    const row = renderedRows()[0]!;
    const title = within(row).getByText("A very long title");
    expect(title).toHaveClass("track-table__cell-text");
    expect(title).toHaveAttribute("data-cut-hint");
  });

  it("leaves a value that is not plain text as it came", () => {
    const columns: TrackColumnDef<Track>[] = [
      { id: "title", header: "Title", sortKey: "title", render: (t) => <b data-testid="chip">{t.title}</b> },
    ];
    renderTable({ columns, source: inMemorySource([{ id: 1, title: "X", artist: "Y", bpm: 1 }]) });
    expect(screen.getByTestId("chip").closest(".track-table__cell-text")).toBeNull();
  });

  it("puts the ellipsis on the value's box, because a flex cell cannot truncate text itself", async () => {
    const css = (await import("./TrackTable.css?raw")).default;
    const cell = /\.track-table__cell\s*\{([^}]*)\}/.exec(css)![1]!;
    const text = /\.track-table__cell-text\s*\{([^}]*)\}/.exec(css)![1]!;
    expect(cell).toMatch(/display:\s*flex/);
    expect(cell).not.toMatch(/text-overflow/);
    expect(text).toMatch(/text-overflow:\s*ellipsis/);
    expect(text).toMatch(/overflow:\s*hidden/);
    expect(text).toMatch(/white-space:\s*nowrap/);
  });
});

describe("a heading follows its column (areas 14, 41)", () => {
  it("is right-aligned for a number column, and plain text for a column that cannot sort", () => {
    renderTable();
    const bpm = screen.getByRole("button", { name: "BPM" });
    expect(bpm).toHaveClass("track-table__header-cell--right");
    const file = screen.getByText("File").closest(".track-table__header-cell")!;
    expect(file.tagName).toBe("DIV");
    expect(file).toHaveClass("track-table__header-cell--plain");
  });
});

describe("the resizer is a separator (C149, C199)", () => {
  it("is a vertical separator you can reach with Tab", () => {
    renderTable();
    const handle = screen.getByRole("separator", { name: "Resize Title column" });
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(handle).toHaveAttribute("aria-valuenow", "200");
  });

  it("Arrow Right and Arrow Left resize by 8 at 1x, and stop at the minimum", () => {
    const onWidthsChange = vi.fn();
    renderTable({ widths: { title: 200, artist: 120, bpm: 80, path: 120 }, onWidthsChange });
    const handle = screen.getByRole("separator", { name: "Resize Title column" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onWidthsChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: 208 }));
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onWidthsChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: 192 }));
  });

  it("stops at the column's minimum", () => {
    const onWidthsChange = vi.fn();
    renderTable({ onWidthsChange });
    const bpm = screen.getByRole("separator", { name: "Resize BPM column" });
    for (let i = 0; i < 5; i += 1) fireEvent.keyDown(bpm, { key: "ArrowLeft" });
    expect(onWidthsChange).toHaveBeenLastCalledWith(expect.objectContaining({ bpm: 60 }));
  });
});

describe("resizing a table with spare width (B2)", () => {
  function measuredAt(width: number) {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("track-table__corner") ? 0 : width;
      },
    });
  }
  afterEach(() => {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  });
  const drawn = () =>
    (screen.getByTestId("track-table").style.getPropertyValue("--track-table-columns").match(/\d+(?=px)/g) ?? []).map(Number);

  it("moves the dragged edge exactly as far as the pointer, wider and narrower", () => {
    measuredAt(1000);
    renderTable();
    const before = drawn()[0]!;
    const handle = screen.getByRole("separator", { name: "Resize Title column" });
    fireEvent.mouseDown(handle, { clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 330 });
    expect(drawn()[0]).toBe(before + 30);
    fireEvent.mouseMove(window, { clientX: 270 });
    expect(drawn()[0]).toBe(before - 30);
    fireEvent.mouseUp(window);
  });

  it("moves the edge by exactly the keyboard step", () => {
    measuredAt(1000);
    renderTable();
    const before = drawn()[0]!;
    const handle = screen.getByRole("separator", { name: "Resize Title column" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(drawn()[0]).toBe(before + 8);
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(drawn()[0]).toBe(before - 8);
  });
});

describe("an empty cell reads as a dash only when the value is missing (C73, S2)", () => {
  it("shows the dash for null and undefined, and nothing for an empty string or false", () => {
    const columns: TrackColumnDef<Track>[] = [
      { id: "title", header: "Title", render: (t) => t.title },
      { id: "artist", header: "Artist", render: () => "" },
      { id: "bpm", header: "BPM", render: () => null },
      { id: "path", header: "File", render: () => undefined },
      { id: "flag", header: "Flag", render: () => false },
    ];
    renderTable({ columns });
    const first = renderedRows()[0]!;
    expect(within(first).getAllByText("—")).toHaveLength(2);
    const cells = within(first).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent(/^$/);
    expect(cells[4]).toHaveTextContent(/^$/);
  });

  it("leaves a column with no header alone, which is a button column", () => {
    const columns: TrackColumnDef<Track>[] = [
      { id: "title", header: "Title", render: (t) => t.title },
      { id: "act", header: "Actions", headerHidden: true, render: () => null },
    ];
    renderTable({ columns });
    expect(within(renderedRows()[0]!).queryByText("—")).toBeNull();
  });
});

describe("sorting by a column with an accessor, in the table (C193)", () => {
  const SORT_COLUMNS: TrackColumnDef<Track>[] = [
    { id: "title", header: "Title", render: (t) => t.title },
    { id: "bpm", header: "BPM", accessor: (t) => t.bpm, render: (t) => (t.bpm == null ? "" : String(t.bpm)) },
  ];
  const DATA: Track[] = [
    { id: 1, title: "A", artist: "x", bpm: 130 },
    { id: 2, title: "B", artist: "x", bpm: null },
    { id: 3, title: "C", artist: "x", bpm: 120 },
  ];

  it("sorts a column that has no engine sort key and says so in aria-sort", () => {
    const onSortChange = vi.fn();
    const { rerender } = renderTable({ columns: SORT_COLUMNS, source: inMemorySource(DATA), onSortChange });
    fireEvent.click(screen.getByRole("button", { name: "BPM" }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "bpm", direction: "asc" });
    rerender(
      <ScaleProvider>
        <TrackTable<Track>
          columns={SORT_COLUMNS}
          source={inMemorySource(DATA)}
          getRowKey={(row) => row.id}
          sort={{ key: "bpm", direction: "asc" }}
        />
      </ScaleProvider>,
    );
    expect(renderedRows().map((row) => within(row).getAllByRole("cell")[0]!.textContent)).toEqual(["C", "A", "B"]);
    expect(screen.getByRole("columnheader", { name: /BPM/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("puts empty values last in either direction", () => {
    renderTable({
      columns: SORT_COLUMNS,
      source: inMemorySource(DATA),
      sort: { key: "bpm", direction: "desc" },
    });
    expect(renderedRows().map((row) => within(row).getAllByRole("cell")[0]!.textContent)).toEqual(["A", "C", "B"]);
  });

  it("leaves a column with an engine sort key to the engine", () => {
    const withKey: TrackColumnDef<Track>[] = [
      { id: "title", header: "Title", render: (t) => t.title },
      { id: "bpm", header: "BPM", sortKey: "bpm", accessor: (t) => t.bpm, render: (t) => String(t.bpm) },
    ];
    renderTable({ columns: withKey, source: inMemorySource(DATA), sort: { key: "bpm", direction: "asc" } });
    expect(renderedRows().map((row) => within(row).getAllByRole("cell")[0]!.textContent)).toEqual(["A", "B", "C"]);
  });
});

describe("a client-only sort is not offered while the rows are not all here (S11)", () => {
  const COLS: TrackColumnDef<Track>[] = [
    { id: "title", header: "Title", sortKey: "title", render: (t) => t.title },
    { id: "bpm", header: "BPM", accessor: (t) => t.bpm, render: (t) => (t.bpm == null ? "" : String(t.bpm)) },
  ];
  const DATA: Track[] = [
    { id: 1, title: "A", artist: "x", bpm: 130 },
    { id: 2, title: "B", artist: "x", bpm: 120 },
  ];
  /** A windowed source with a hole in it: row 1 has not arrived. */
  const partial: TrackTableSource<Track> = {
    total: 2,
    getRow: (index) => (index === 0 ? DATA[0] : undefined),
    requestWindow: () => {},
    status: "ready",
  };

  it("never sends a client-only column id to the engine as a sort key", () => {
    const onSortChange = vi.fn();
    renderTable({ columns: COLS, source: partial, onSortChange });
    // The BPM heading is plain text: it has no engine key and the list is not whole.
    expect(screen.queryByRole("button", { name: "BPM" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Title" }));
    expect(onSortChange).toHaveBeenCalledTimes(1);
    expect(onSortChange).toHaveBeenLastCalledWith({ key: "title", direction: "asc" });
  });

  it("offers it once every row has arrived, and sorts on the client", () => {
    const onSortChange = vi.fn();
    const { rerender } = renderTable({ columns: COLS, source: partial, onSortChange });
    expect(screen.queryByRole("button", { name: "BPM" })).toBeNull();
    rerender(
      <ScaleProvider>
        <TrackTable<Track> columns={COLS} source={inMemorySource(DATA)} getRowKey={(row) => row.id} onSortChange={onSortChange} />
      </ScaleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "BPM" }));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: "bpm", direction: "asc" });
  });

  it("does not mark a client sort as applied while it cannot be", () => {
    renderTable({ columns: COLS, source: partial, sort: { key: "bpm", direction: "asc" }, onSortChange: vi.fn() });
    expect(screen.getByRole("columnheader", { name: /BPM/ })).toHaveAttribute("aria-sort", "none");
  });
});

describe("the row's play button (C84)", () => {
  it("draws the shared play button at the row's end and plays that row", () => {
    const onPlay = vi.fn();
    renderTable({ playButton: { label: (t) => `Play ${t.title}`, onPlay } });
    const button = screen.getByRole("button", { name: "Play Track 2" });
    expect(button).toHaveClass("cp-play-btn");
    expect(button.closest(".track-table__end")).not.toBeNull();
    fireEvent.click(button);
    expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), 1);
  });

  it("does not select the row when the button is pressed", () => {
    const onSelect = vi.fn();
    renderTable({ onSelect, playButton: { label: (t) => `Play ${t.title}`, onPlay: () => {} } });
    fireEvent.click(screen.getByRole("button", { name: "Play Track 1" }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("a drag the table will not take (C187)", () => {
  it("answers none, so the pointer shows a no-drop cursor", () => {
    renderTable({ onRowDrop: () => {}, acceptsRowDrop: () => false });
    const table = screen.getByRole("table", { name: "Tracks" });
    const dataTransfer = { dropEffect: "move", effectAllowed: "move" } as unknown as DataTransfer;
    fireEvent.dragOver(table, { dataTransfer });
    expect(dataTransfer.dropEffect).toBe("none");
  });
});
