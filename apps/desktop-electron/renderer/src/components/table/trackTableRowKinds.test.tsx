/**
 * A table whose rows are of more than one kind (PREP-10).
 *
 * The Set table's chapter headings are rows of its own row type, not a
 * `TrackTable` feature (DEC-112). The table only lets a caller class a row,
 * say which rows can be picked up, and hear which row a drop landed on; what
 * any of it means stays the caller's.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { TrackTable, type TrackTableProps } from "./TrackTable";
import { inMemorySource } from "./trackTableSource";
import type { TrackColumnDef } from "./trackTableLayout";

interface Row {
  id: number;
  title: string;
  heading?: boolean;
}

const COLUMNS: TrackColumnDef<Row>[] = [{ id: "title", header: "Title", render: (r) => r.title }];
const ROWS: Row[] = [
  { id: -1, title: "Warm-up", heading: true },
  { id: 1, title: "One" },
  { id: 2, title: "Two" },
];

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 400 });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
});

function draw(props: Partial<TrackTableProps<Row>> = {}) {
  render(
    <ScaleProvider>
      <TrackTable<Row>
        columns={COLUMNS}
        source={inMemorySource(ROWS)}
        getRowKey={(r) => r.id}
        {...props}
      />
    </ScaleProvider>,
  );
}

function rowOf(title: string): HTMLElement {
  return screen.getByText(title).closest('[role="row"]') as HTMLElement;
}

describe("rows of more than one kind", () => {
  it("wears the class its caller gives it, and no other", () => {
    draw({ rowClassName: (row) => (row.heading ? "is-heading" : undefined) });
    expect(rowOf("Warm-up")).toHaveClass("track-table__row", "is-heading");
    expect(rowOf("One")).not.toHaveClass("is-heading");
  });

  it("can be picked up only where its caller says", () => {
    const onRowDragStart = vi.fn();
    draw({ onRowDragStart, canDragRow: (row) => !row.heading });
    expect(rowOf("Warm-up")).toHaveAttribute("draggable", "false");
    expect(rowOf("One")).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(rowOf("Warm-up"), { dataTransfer: { setData: vi.fn() } });
    expect(onRowDragStart).not.toHaveBeenCalled();
  });

  it("is still draggable everywhere when its caller does not say", () => {
    draw({ onRowDragStart: vi.fn() });
    expect(rowOf("Warm-up")).toHaveAttribute("draggable", "true");
  });
});
