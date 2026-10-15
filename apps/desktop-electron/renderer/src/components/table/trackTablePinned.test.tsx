/** Pinned columns let go when the pane is too narrow to leave room beside them. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { TrackTable } from "./TrackTable";
import { inMemorySource } from "./trackTableSource";
import { stickyFits, type TrackColumnDef } from "./trackTableLayout";

interface Row {
  id: number;
  title: string;
}

const COLUMNS: TrackColumnDef<Row>[] = [
  { id: "position", header: "#", sticky: true, defaultWidthPx: 72, minWidthPx: 40, render: () => "1" },
  { id: "title", header: "Title", sticky: true, defaultWidthPx: 300, minWidthPx: 120, render: (r) => r.title },
  { id: "key", header: "Key", render: () => "8A" },
];

describe("stickyFits", () => {
  it("keeps the pinned columns while room is left beside them", () => {
    expect(stickyFits(COLUMNS, [72, 300, 80], 600, 1)).toBe(true);
  });
  it("lets go when the pinned columns would fill the viewport (368px pane, 372px pinned)", () => {
    expect(stickyFits(COLUMNS, [72, 300, 80], 368, 1)).toBe(false);
  });
  it("keeps them when the viewport is not measured", () => {
    expect(stickyFits(COLUMNS, [72, 300, 80], 0, 1)).toBe(true);
  });
});

describe("a table in a pane narrower than its pinned columns", () => {
  let width = 368;
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => width });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 400 });
  });
  afterAll(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
    Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  });

  const table = () => (
    <ScaleProvider>
      <TrackTable<Row> columns={COLUMNS} source={inMemorySource([{ id: 1, title: "A" }])} getRowKey={(r) => r.id} />
    </ScaleProvider>
  );

  it("does not pin, so the other columns scroll into reach", () => {
    width = 368;
    const { container } = render(table());
    expect(screen.getByRole("table")).toBeTruthy();
    expect(container.querySelector(".track-table__header-cell-wrap--sticky")).toBeNull();
    expect(container.querySelector(".track-table__cell--sticky")).toBeNull();
  });

  it("pins when the pane is wide enough", () => {
    width = 900;
    const { container } = render(table());
    expect(container.querySelector(".track-table__header-cell-wrap--sticky")).not.toBeNull();
  });
});
