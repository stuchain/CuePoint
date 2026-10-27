/** Pinned columns let go when the pane is too narrow to leave room beside them. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ScaleProvider } from "../../tokens/ScaleContext";
import { TrackTable } from "./TrackTable";
import { inMemorySource } from "./trackTableSource";
import { stickyFits, type TrackColumnDef } from "./trackTableLayout";
import tableCss from "./TrackTable.css?raw";
import { declarations, parseRules, stripComments } from "../../test/cssRules";

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
    expect(screen.getByRole("grid")).toBeTruthy();
    expect(container.querySelector(".track-table__header-cell-wrap--sticky")).toBeNull();
    expect(container.querySelector(".track-table__cell--sticky")).toBeNull();
  });

  it("pins when the pane is wide enough", () => {
    width = 900;
    const { container } = render(table());
    expect(container.querySelector(".track-table__header-cell-wrap--sticky")).not.toBeNull();
  });
});

describe("a pinned cell's row line (new G)", () => {
  it("draws the row's divider itself, which its fill would otherwise cover, so the line runs through Title", () => {
    const rules = parseRules(stripComments(tableCss));
    const sticky = rules.find((rule) => rule.selector === ".track-table__cell--sticky" && rule.context === "")!;
    const row = rules.find((rule) => rule.selector === ".track-table__row" && rule.context === "")!;
    const line = new Map(declarations(row.body)).get("box-shadow");
    // P5: the row line is the one --row-line token (the theme's row divider mixed towards the rows).
    expect(line).toBe("inset 0 calc(-1 * var(--hairline)) 0 0 var(--row-line)");
    // D13 (M89): the pinned cell draws that line, and a 1 px edge on its right where the scrolling
    // columns are cut.
    const drawn = (new Map(declarations(sticky.body)).get("box-shadow") ?? "").replace(/\s+/g, " ");
    expect(drawn).toContain(line);
    expect(drawn).toContain("inset calc(-1 * var(--hairline)) 0 0 0 var(--row-line)");
  });

  it("M89: the Columns button's track and its cells in the rows end at a 1 px edge on their left", () => {
    const rules = parseRules(stripComments(tableCss));
    for (const selector of [".track-table__corner", ".track-table__row-corner"]) {
      const rule = rules.find((candidate) => candidate.selector === selector && candidate.context === "")!;
      expect((new Map(declarations(rule.body)).get("box-shadow") ?? "").replace(/\s+/g, " ")).toContain(
        "inset var(--hairline) 0 0 0 var(--row-line)",
      );
    }
  });

  it("M202: the selected row's bar is drawn on the first pinned cell by `first-of-type`, since a grip span can be the first child", () => {
    expect(tableCss).toContain(".track-table__row--selected .track-table__cell--sticky:first-of-type");
    expect(tableCss).not.toMatch(/--sticky:first-child/);
  });
});
