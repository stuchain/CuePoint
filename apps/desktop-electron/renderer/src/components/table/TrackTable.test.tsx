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
 * component serve the library, the match results and inCrate.
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
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

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
    render: (t) => (t.bpm == null ? "" : t.bpm.toFixed(1)),
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

describe("headers", () => {
  it("renders one per column", () => {
    renderTable();
    for (const column of COLUMNS) {
      expect(screen.getByRole("button", { name: column.header })).toBeInTheDocument();
    }
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
    expect(screen.getByRole("button", { name: "Title" })).toHaveTextContent("▲");
  });
});

describe("a column that cannot be sorted", () => {
  it("has a disabled header", () => {
    renderTable({ onSortChange: vi.fn() });
    expect(screen.getByRole("button", { name: "File" })).toBeDisabled();
  });

  it("asks for nothing when clicked", () => {
    const onSortChange = vi.fn();
    renderTable({ onSortChange });

    fireEvent.click(screen.getByRole("button", { name: "File" }));

    expect(onSortChange).not.toHaveBeenCalled();
  });
});

describe("rows", () => {
  it("renders each column's value through its own renderer", () => {
    renderTable({ source: inMemorySource([{ id: 7, title: "Strobe", artist: "deadmau5", bpm: 128 }]) });

    const row = renderedRows()[0]!;
    expect(within(row).getByText("Strobe")).toBeInTheDocument();
    expect(within(row).getByText("deadmau5")).toBeInTheDocument();
    expect(within(row).getByText("128.0")).toBeInTheDocument();
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
      "600px 360px 240px 360px",
    );
  });

  it("raises a stored width that is below the scaled minimum", () => {
    // A column dragged narrow at 1× must not be narrower than its own resize
    // handle at 3×.
    localStorage.setItem("cuepoint-ui-lab-scale", "3");
    renderTable({ widths: { title: 200, artist: 120, bpm: 60, path: 120 } });

    const table = screen.getByTestId("track-table");
    expect(table.style.getPropertyValue("--track-table-columns")).toBe(
      "240px 240px 180px 240px",
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
      "200px 120px 80px 120px",
    );
  });

  it("uses the widths it is given", () => {
    renderTable({ widths: { title: 300, artist: 100, bpm: 60, path: 90 } });
    const table = screen.getByTestId("track-table");
    expect(table.style.getPropertyValue("--track-table-columns")).toBe(
      "300px 100px 60px 90px",
    );
  });

  it("reports a drag rather than deciding it", () => {
    const onWidthsChange = vi.fn();
    renderTable({ widths: { title: 200, artist: 120, bpm: 80, path: 120 }, onWidthsChange });

    const handle = screen.getByRole("button", { name: "Resize Title column" });
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

    const handle = screen.getByRole("button", { name: "Resize BPM column" });
    fireEvent.mouseDown(handle, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 0 });
    fireEvent.mouseUp(window);

    expect(onWidthsChange).toHaveBeenLastCalledWith(expect.objectContaining({ bpm: 60 }));
  });

  it("resizes without a controlled width, for a caller that does not persist", () => {
    renderTable();

    const handle = screen.getByRole("button", { name: "Resize Title column" });
    fireEvent.mouseDown(handle, { clientX: 0 });
    fireEvent.mouseMove(window, { clientX: 40 });
    fireEvent.mouseUp(window);

    const table = screen.getByTestId("track-table");
    expect(table.style.getPropertyValue("--track-table-columns")).toBe(
      "240px 120px 80px 120px",
    );
  });

  it("marks the body while a column is being dragged", () => {
    renderTable();

    const handle = screen.getByRole("button", { name: "Resize Title column" });
    fireEvent.mouseDown(handle, { clientX: 0 });
    expect(document.body).toHaveClass("track-table--resizing");

    fireEvent.mouseUp(window);
    expect(document.body).not.toHaveClass("track-table--resizing");
  });
});
